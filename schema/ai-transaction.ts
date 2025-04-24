import { z } from "zod";

export const AITransactionInputSchema = z.object({
    text: z.string().min(1, "Please enter some text to analyze")
});

export type AITransactionInputSchemaType = z.infer<typeof AITransactionInputSchema>;

export const AITransactionResponseSchema = z.object({
    transaction: z.object({
        type: z.union([z.literal("income"), z.literal("expense")]),
        description: z.string().optional(),
        amount: z.number().positive(),
        category: z.string(),
        date: z.date()
    }),
    category: z.object({
        exists: z.boolean(),
        name: z.string(),
        type: z.union([z.literal("income"), z.literal("expense")]),
        icon: z.string()
    })
});

export type AITransactionResponseSchemaType = z.infer<typeof AITransactionResponseSchema>;
