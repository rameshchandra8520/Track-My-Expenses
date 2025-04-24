import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { currentUser } from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";

// Initialize the Google Generative AI client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export async function POST(request: NextRequest) {
  try {
    const user = await currentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { text } = await request.json();
    if (!text) {
      return NextResponse.json({ error: "Text is required" }, { status: 400 });
    }

    // Get user's existing categories for reference
    const userCategories = await prisma.category.findMany({
      where: {
        userId: user.id,
      },
    });

    // Prepare the prompt for Gemini
    const prompt = `
      Extract transaction details from the following text: "${text}"
      
      Return a JSON object with the following structure:
      {
        "type": "income" or "expense",
        "description": "brief description of the transaction",
        "amount": number (positive),
        "category": "category name",
        "icon": "a single emoji that best represents this category",
        "date": "YYYY-MM-DD" (if mentioned, otherwise null)
      }
      
      Existing categories:
      Income categories: ${userCategories
        .filter((c) => c.type === "income")
        .map((c) => `${c.name} (${c.icon})`)
        .join(", ")}
      Expense categories: ${userCategories
        .filter((c) => c.type === "expense")
        .map((c) => `${c.name} (${c.icon})`)
        .join(", ")}
      
      If a category is mentioned that doesn't match any existing category, suggest the closest match or a new appropriate category name.
      For the icon, choose a single emoji that best represents the category. For example:
      - Food/Groceries: 🍔 or 🛒
      - Transportation: 🚗 or 🚆
      - Salary/Income: 💰 or 💵
      - Entertainment: 🎬 or 🎮
      - Shopping: 🛍️ or 👕
      - Bills/Utilities: 📱 or 💡
      - Health: 💊 or 🏥
      - Education: 📚 or 🎓
      - Travel: 🛋️ or 🛋️
      - Home: 🏠 or 🏡
      - Food: 🍔 or 🛒
      
      Only return the JSON object, nothing else.
    `;

    // Call Gemini API
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro-exp-03-25" });
    const result = await model.generateContent(prompt);
    const response = result.response;
    const textResponse = response.text();

    // Parse the JSON response
    let parsedResponse;
    try {
      // Extract JSON from the response (in case there's any extra text)
      const jsonMatch = textResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedResponse = JSON.parse(jsonMatch[0]);
      } else {
        parsedResponse = JSON.parse(textResponse);
      }
    } catch (error) {
      console.error("Failed to parse Gemini response:", error);
      return NextResponse.json(
        { error: "Failed to parse AI response" },
        { status: 500 }
      );
    }

    // Check if we need to create a new category
    let categoryExists = userCategories.some(
      (c) => 
        c.name.toLowerCase() === parsedResponse.category.toLowerCase() && 
        c.type === parsedResponse.type
    );

    let categoryInfo = {
      exists: categoryExists,
      name: parsedResponse.category,
      type: parsedResponse.type,
      icon: parsedResponse.icon || "💼" // Default icon if none provided
    };

    return NextResponse.json({
      transaction: {
        type: parsedResponse.type,
        description: parsedResponse.description,
        amount: parsedResponse.amount,
        category: parsedResponse.category,
        date: parsedResponse.date ? new Date(parsedResponse.date) : new Date(),
      },
      category: categoryInfo,
    });
  } catch (error) {
    console.error("Error processing AI transaction:", error);
    return NextResponse.json(
      { error: "Failed to process transaction" },
      { status: 500 }
    );
  }
}
