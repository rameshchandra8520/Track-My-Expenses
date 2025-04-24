// import prisma from "@/lib/prisma";
// import { currentUser } from "@clerk/nextjs/server";
// import { redirect } from "next/navigation";

// export async function GET(request: Request) {
//     const user = await currentUser()

//     if (!user) {
//         redirect('/sign-in')
//     }

//     const periods = await getHistoryPeriods(user.id);
//     return Response.json(periods);
// }

// export type GetHistoryPeriodsResponseType = Awaited<ReturnType<typeof getHistoryPeriods>>;

// async function getHistoryPeriods(userId: string) {
//     const result = await prisma.monthHistory.findMany({
//         where: {
//             userId,
//         },
//         select: {
//             year: true,
//         },
//         distinct: ['year'],
//         orderBy: {
//             year: 'asc'
//         },
//     });

//     const years = result.map((el) => el.year)
//     if (years.length === 0) {
//         return [new Date().getFullYear]
//     }

//     return years;
// }

import prisma from "@/lib/prisma";
import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getRedisClient } from "@/lib/redis";

export async function GET(request: Request) {
    const user = await currentUser();

    if (!user) {
        redirect('/sign-in');
        return; 
    }

    // Redis cache lookup
    const redisClient = await getRedisClient();
    const versionKey = `transactionsVersion:${user.id}`;
    let version = await redisClient.get(versionKey) || '0';
    const cacheKey = `historyPeriods:${user.id}:${version}`;
    const cached = await redisClient.get(cacheKey);
    if (cached) {
        return new Response(cached, {
            headers: { 'Content-Type': 'application/json' }
        });
    }
    // Remove previous version cache
    if (version !== '0') {
        const prev = (parseInt(version, 10) - 1).toString();
        await redisClient.del(`historyPeriods:${user.id}:${prev}`);
    }

    const periods = await getHistoryPeriods(user.id);
    // Cache result for 2 days
    await redisClient.set(cacheKey, JSON.stringify(periods), { EX: 2 * 24 * 60 * 60 });
    return new Response(JSON.stringify(periods), {
        headers: { 'Content-Type': 'application/json' }
    });
}

export type GetHistoryPeriodsResponseType = Awaited<ReturnType<typeof getHistoryPeriods>>;

async function getHistoryPeriods(userId: string) {
    const result = await prisma.monthHistory.findMany({
        where: { userId },
        select: { year: true },
        distinct: ['year'],
        orderBy: { year: 'asc' }
    });

    const years = result.map((el) => el.year);
    if (years.length === 0) {
        return [new Date().getFullYear()];
    }

    return years;
}
