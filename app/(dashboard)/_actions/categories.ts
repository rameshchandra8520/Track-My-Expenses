'use server'

import prisma from "@/lib/prisma";
import { CreateCategorySchema, CreateCategorySchemaType, DeleteCategorySchemaType, DeleteCategoryShema } from "@/schema/categories";
import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export async function CreateCategory(form: CreateCategorySchemaType) {
    const parsedBody = CreateCategorySchema.safeParse(form);

    if (!parsedBody.success) {
        throw new Error("bad request");
    }

    const user = await currentUser();
    if (!user) {
        redirect("/sign-in")
    }

    const { name, icon, type } = parsedBody.data;
    return await prisma.category.create({
        data: {
            userId: user.id,
            name,
            icon,
            type
        }
    })
}

export async function UpdateCategory(form: CreateCategorySchemaType & { id: string }) {
    const parsedBody = CreateCategorySchema.safeParse(form);

    if (!parsedBody.success) {
        throw new Error("Invalid category data");
    }

    const user = await currentUser();
    if (!user) {
        redirect("/sign-in")
    }

    const { name, icon, type, id } = form;
    
    // Check if the category belongs to the current user
    const existingCategory = await prisma.category.findUnique({
        where: {
            id,
            userId: user.id
        }
    });

    if (!existingCategory) {
        throw new Error("Category not found or unauthorized");
    }

    return await prisma.category.update({
        where: {
            id,
            userId: user.id
        },
        data: {
            name,
            icon,
            type
        }
    });
}

export async function DeleteCategory(form: DeleteCategorySchemaType) {
    const parsedBody = DeleteCategoryShema.safeParse(form);
    if (!parsedBody.success) {
        throw new Error('bad request');
    }

    const user = await currentUser()
    if (!user) {
        redirect('/sign-in')
        return;
    }

    return await prisma.category.delete({
        where: {
            name_type_userId: {
                userId: user.id,
                name: parsedBody.data.name,
                type: parsedBody.data.type
            }
        }
    })
}