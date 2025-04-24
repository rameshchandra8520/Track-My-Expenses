import prisma from "@/lib/prisma";
import { OverViewQuerySchema } from "@/schema/overview";
import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getRedisClient } from "@/lib/redis";

export async function GET(request: Request) {
    const user = await currentUser();
    if (!user) {
        redirect('sign-in')
    }

    const { searchParams } = new URL(request.url)
    const from = searchParams.get('from')
    const to = searchParams.get('to')

    const queryParams = OverViewQuerySchema.safeParse({ from, to })
    if (!queryParams.success) {
        throw new Error(queryParams.error.message)
    }

    // Redis cache lookup
    const redisClient = await getRedisClient();
    let version = await redisClient.get(`transactionsVersion:${user.id}`) || '0';
    const fromIso = queryParams.data.from.toISOString().slice(0,10);
    const toIso = queryParams.data.to.toISOString().slice(0,10);
    const cacheKey = `statsCategories:${user.id}:${version}:${fromIso}:${toIso}`;
    const cached = await redisClient.get(cacheKey);
    if (cached) { 
        return Response.json(JSON.parse(cached)); 
    }

    // When new version, remove old cache
    if (version !== '0') {
        let versionInt = parseInt(version, 10);
        versionInt -= 1;
        version = versionInt.toString();
        await redisClient.del(`statsCategories:${user.id}:${version}:*`);
    }

    const stats = await getCategoriesStats(user.id, queryParams.data.from, queryParams.data.to)
    // Cache result for 2 days
    await redisClient.set(cacheKey, JSON.stringify(stats), { EX: 2 * 24 * 60 * 60 });
    return Response.json(stats);
}

export type GetCategoriesStatsResponseType = Awaited<ReturnType<typeof getCategoriesStats>>;

async function getCategoriesStats(userId: string, from: Date, to: Date) {
    const stats = await prisma.transaction.groupBy({
        by: ['type', 'category', 'categoryIcon'],
        where: {
            userId,
            date: {
                gte: from,
                lte: to
            },
        },
        _sum: {
            amount: true,
        },
        orderBy: {
            _sum: {
                amount: 'desc'
            }
        }
    })
    return stats;
}