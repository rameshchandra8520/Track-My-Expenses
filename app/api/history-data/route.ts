import prisma from "@/lib/prisma";
import { Period, Timeframe } from "@/lib/types";
import { currentUser } from "@clerk/nextjs/server";
import { getDaysInMonth } from "date-fns";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getRedisClient } from "@/lib/redis";

const getHistoryDataSchema = z.object({
    timeframe: z.enum(['month', 'year']),
    month: z.coerce.number().min(0).max(11).default(0),
    year: z.coerce.number().min(2000).max(3000)
});

export async function GET(request: Request) {
    const user = await currentUser()
    if (!user) {
        redirect('/sign-in')
        return
    }

    const { searchParams } = new URL(request.url);
    let timeframe = searchParams.get('timeframe')
    let year = searchParams.get('year')
    let month = searchParams.get('month')

    const parseResult = getHistoryDataSchema.safeParse({
        timeframe,
        year,
        month
    });

    if (!parseResult.success) {
        return Response.json(parseResult.error.message, {
            status: 400,
        })
    }

    // Redis cache lookup
    const redis = await getRedisClient();
    let version = await redis.get(`transactionsVersion:${user.id}`) || '0';
    const cacheKey = parseResult.data.timeframe === 'month'
        ? `historyData:${user.id}:${version}:month:${parseResult.data.year}:${parseResult.data.month}`
        : `historyData:${user.id}:${version}:year:${parseResult.data.year}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
        return Response.json(JSON.parse(cached));
    }

    const data = await getHistoryData(user.id, parseResult.data.timeframe, {
        month: parseResult.data.month,
        year: parseResult.data.year
    })

    // When new version, remove old cache
    if (version !== '0') {
        let versionInt = parseInt(version, 10);
        versionInt -= 1;
        version = versionInt.toString();
        await redis.del(`historyData:${user.id}:${version}:*`);
    }

    // cache result for 2 days
    await redis.set(cacheKey, JSON.stringify(data), { EX: 2 * 24 * 60 * 60 });
    return Response.json(data)
}

export type GetHistoryDataResponseType = Awaited<ReturnType<typeof getHistoryData>>;

async function getHistoryData(userId: string, timeframe: Timeframe, period: Period) {
    switch (timeframe) {
        case 'year':
            return await getYearHistoryData(userId, period.year);
        case 'month':
            return await getMonthHistoryData(userId, period.year, period.month);
    }
}

type HistoryData = {
    expense: number,
    income: number,
    year: number,
    month: number,
    day?: number
}

async function getYearHistoryData(userId: string, year: number) {
    const result = await prisma.yearHistory.groupBy({
        by: ["month"],
        where: {
            userId,
            year,
        },
        _sum: {
            expense: true,
            income: true,
        },
        orderBy: [
            {
                month: 'asc'
            },
        ],
    });

    if (!result || result.length === 0) return [];
    const history: HistoryData[] = [];

    for (let i = 0; i < 12; i++) {
        let expense = 0;
        let income = 0;

        const month = result.find((row) => row.month === i);
        if (month) {
            expense = month._sum.expense || 0;
            income = month._sum.income || 0;
        }

        history.push({
            year,
            month: i,
            expense,
            income,
        })
    }
    return history;
}

async function getMonthHistoryData(userId: string, year: number, month: number) {
    const result = await prisma.monthHistory.groupBy({
        by: ['day'],
        where: {
            userId,
            year,
            month,
        },
        _sum: {
            expense: true,
            income: true,
        },
        orderBy: [
            {
                day: 'asc'
            },
        ],
    });

    if (!result || result.length === 0) return [];

    const history: HistoryData[] = [];

    const dayInMonth = getDaysInMonth(new Date(year, month));
    for (let i = 1; i <= dayInMonth; i++) {
        let expense = 0;
        let income = 0;

        const day = result.find((row) => row.day === i)
        if (day) {
            expense = day._sum.expense || 0;
            income = day._sum.income || 0;
        }


        history.push({
            expense,
            income,
            year,
            month,
            day: i,
        })
    }

    return history;
}