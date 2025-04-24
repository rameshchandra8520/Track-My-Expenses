import prisma from "@/lib/prisma";
import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getRedisClient } from "@/lib/redis";

export async function GET(request: Request) {
    const user = await currentUser()
    if (!user) {
        redirect('/sign-in')
    }

    const { searchParams } = new URL(request.url)
    const paramType = searchParams.get("type")

    const validator = z.enum(["expense", "income"]).nullable()
    const queryParams = validator.safeParse(paramType)
    if (!queryParams.success) {
        return Response.json(queryParams.error, {
            status: 400,
        })
    }

    const type = queryParams.data;
    // Redis cache lookup
    const redisClient = await getRedisClient();
    const versionKey = `categoriesVersion:${user.id}`;
    let version = await redisClient.get(versionKey) || '0';
    const filterType = type || 'all';
    const cacheKey = `categories:${user.id}:${version}:${filterType}`;
    const cached = await redisClient.get(cacheKey);
    if (cached) { 
        return Response.json(JSON.parse(cached)); 
    }

    // When new version, remove old cache
    if (version !== '0') {
        let versionInt = parseInt(version, 10);
        versionInt -= 1;
        version = versionInt.toString();
        await redisClient.del(`categories:${user.id}:${version}:*`);
    }

    const categories = await prisma.category.findMany({
        where: {
            userId: user.id,
            ...(type && { type })
        },
        orderBy: {
            name: 'asc'
        }
    })

    // cache result for 2 days
    await redisClient.set(cacheKey, JSON.stringify(categories), { EX: 2 * 24 * 60 * 60 });
    return Response.json(categories);
}