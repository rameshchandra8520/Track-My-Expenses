'use server'

import prisma from "@/lib/prisma";
import { CreateTransactionSchema, CreateTransactionSchemaType } from "@/schema/transaction";
import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getRedisClient } from "@/lib/redis";

export async function CreateTransaction(form: CreateTransactionSchemaType) {
    const parsedBody = CreateTransactionSchema.safeParse(form)
    if (!parsedBody.success) {
        throw new Error(parsedBody.error.message)
    }

    const user = await currentUser()
    if (!user) {
        redirect('/sign-in')
    }

    const { amount, category, date, description, type } = parsedBody.data;
    const categoryRow = await prisma.category.findFirst({
        where: {
            userId: user.id,
            name: category
        }
    })

    if (!categoryRow) {
        throw new Error('category not found')
    }


    await prisma.$transaction([
        prisma.transaction.create({
            data: {
                userId: user.id,
                amount,
                date,
                description: description || '',
                type,
                category: categoryRow.name,
                categoryIcon: categoryRow.icon
            },
        }),

        prisma.monthHistory.upsert({
            where: {
                day_month_year_userId: {
                    userId: user.id,
                    day: date.getUTCDate(),
                    month: date.getUTCMonth(),
                    year: date.getUTCFullYear(),
                },
            },
            create: {
                userId: user.id,
                day: date.getUTCDate(),
                month: date.getUTCMonth(),
                year: date.getUTCFullYear(),
                expense: type === "expense" ? amount : 0,
                income: type === "income" ? amount : 0,
            },
            update: {
                expense: {
                    increment: type === "expense" ? amount : 0,
                },
                income: {
                    increment: type === "income" ? amount : 0,
                }
            }
        }),

        prisma.yearHistory.upsert({
            where: {
                month_year_userId: {
                    userId: user.id,
                    month: date.getUTCMonth(),
                    year: date.getUTCFullYear(),
                },
            },
            create: {
                userId: user.id,
                month: date.getUTCMonth(),
                year: date.getUTCFullYear(),
                expense: type === "expense" ? amount : 0,
                income: type === "income" ? amount : 0,
            },
            update: {
                expense: {
                    increment: type === "expense" ? amount : 0,
                },
                income: {
                    increment: type === "income" ? amount : 0,
                }
            }
        })

    ])

    // bump cache version so stale entries expire only when new data added
    try {
        const redis = await getRedisClient();
        await redis.incr(`transactionsVersion:${user.id}`);
    } catch (err) {
        console.error("Failed to bump transactions version:", err);
    }
}