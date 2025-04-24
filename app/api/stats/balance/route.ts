import prisma from "@/lib/prisma";
import { OverViewQuerySchema } from "@/schema/overview";
import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getRedisClient } from "@/lib/redis";

export async function GET(request: Request) {
    const user = await currentUser()
    if (!user) {
        redirect('.sign-in');
    }

    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    const queryParams = OverViewQuerySchema.safeParse({ from, to });

    if (!queryParams.success) {
        return Response.json(queryParams.error.message, {
            status: 400,
        })
    }

    // Redis cache lookup
    const redisClient = await getRedisClient();
    let version = await redisClient.get(`transactionsVersion:${user.id}`) || '0';
    const fromIso = queryParams.data.from.toISOString().slice(0,10);
    const toIso = queryParams.data.to.toISOString().slice(0,10);
    const cacheKey = `statsBalance:${user.id}:${version}:${fromIso}:${toIso}`;
    const cached = await redisClient.get(cacheKey);
    if (cached) {
        return Response.json(JSON.parse(cached));
    }

    // When new version, remove old cache
    if (version !== '0') {
        let versionInt = parseInt(version, 10);
        versionInt -= 1;
        version = versionInt.toString();
        await redisClient.del(`statsBalance:${user.id}:${version}:*`);
    }

    const stats = await getBalanceStats(
        user.id,
        queryParams.data.from,
        queryParams.data.to
    )
    // Cache result for 2 days
    await redisClient.set(cacheKey, JSON.stringify(stats), { EX: 2 * 24 * 60 * 60 });

    return Response.json(stats)
}

export type GetBalanceStatsResponseType = Awaited<ReturnType<typeof getBalanceStats>>;

async function getBalanceStats(userId: string, from: Date, To: Date) {
    const totals = await prisma.transaction.groupBy({
        by: ["type"],
        where: {
            userId,
            date: {
                gte: from,
                lte: To
            }
        },
        _sum: {
            amount: true
        }
    });

    return {
        expense: totals.find((t) => t.type === 'expense')?._sum.amount || 0,
        income: totals.find((t) => t.type === 'income')?._sum.amount || 0
    }
}