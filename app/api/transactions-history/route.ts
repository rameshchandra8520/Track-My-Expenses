import { GetFormatterForCurrency } from "@/lib/helper";
import prisma from "@/lib/prisma";
import { OverViewQuerySchema } from "@/schema/overview";
import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export async function GET(request: Request) {
    const user = await currentUser();
    if (!user) {
        redirect('/sign-in');
        return;
    }


    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    const queryParams = OverViewQuerySchema.safeParse({
        from,
        to
    })

    if (!queryParams.success) {
        return Response.json(queryParams.error.message, {
            status: 400,
        })
    }

    const transactions = await getTransactionsHistory(
        user.id,
        queryParams.data.from,
        queryParams.data.to
    )
    return Response.json(transactions);
}

export type GetTransactionHistoryResponseType = Awaited<ReturnType<typeof getTransactionsHistory>>;

async function getTransactionsHistory(userId: string, from: Date, to: Date) {
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
        }
    });

    return transactions.map((transaction) => ({
        ...transaction,
        formattedAmount: formatter.format(transaction.amount),
    }))
}