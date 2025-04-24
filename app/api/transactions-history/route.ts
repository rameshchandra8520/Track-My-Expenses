import { GetFormatterForCurrency } from "@/lib/helper";
import prisma from "@/lib/prisma";
import { OverViewQuerySchema } from "@/schema/overview";
import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getRedisClient } from "@/lib/redis";

export async function GET(request: Request) {
    const user = await currentUser();
    if (!user) {
        redirect('/sign-in');
        return;
    }


    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const pageString = searchParams.get('page') || '1';
    const pageSizeString = searchParams.get('pageSize') || '10';

    const queryParams = OverViewQuerySchema.safeParse({
        from,
        to
    })

    if (!queryParams.success) {
        return Response.json(queryParams.error.message, {
            status: 400,
        })
    }

    const page = parseInt(pageString, 10);
    const pageSize = parseInt(pageSizeString, 10);
    const fromDate = queryParams.data.from;
    const toDate = queryParams.data.to;
    const redisClient = await getRedisClient();
    const versionKey = `transactionsVersion:${user.id}`;
    let version = await redisClient.get(versionKey);
    if (!version) version = '0';
    const fromDateIso = fromDate.toISOString().slice(0, 10);
    const toDateIso = toDate.toISOString().slice(0, 10);
    const cacheKey = `transactions:${user.id}:${version}:${fromDateIso}:${toDateIso}:${page}:${pageSize}`;
    const cached = await redisClient.get(cacheKey);
    console.log('Cache key:', cacheKey);
    if (cached) {
        console.log('Cache hit');
        return Response.json(JSON.parse(cached));
    }

    console.log('Cache miss');
    const transactions = await getTransactionsHistory(
        user.id,
        fromDate,
        toDate,
        page,
        pageSize
    );
    await redisClient.set(cacheKey, JSON.stringify(transactions), { EX: 2 * 24 * 60 * 60 });
    return Response.json(transactions);
}

export type GetTransactionHistoryResponseType = Awaited<ReturnType<typeof getTransactionsHistory>>;

async function getTransactionsHistory(
    userId: string, 
    from: Date, 
    to: Date,
    page: number = 1,
    pageSize: number = 10
) {
    const userSettings = await prisma.userSettings.findUnique({
        where: {
            userId
        }
    });

    if (!userSettings) {
        throw new Error('user settings not found');
    }

    const formatter = GetFormatterForCurrency(userSettings.currency);
    const transactions = await prisma.transaction.findMany({
        where: {
            userId,
            date: {
                gte: from,
                lte: to
            }
        },
        orderBy: {
            date: 'asc'
        },
        skip: (page - 1) * pageSize,
        take: pageSize
    });

    return transactions.map((transaction) => ({
        ...transaction,
        formattedAmount: formatter.format(transaction.amount),
    }))
}