"use client";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { TransactionType } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  CreateTransactionSchema,
  CreateTransactionSchemaType,
} from "@/schema/transaction";
import { ReactNode, useCallback, useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import CategoryPicker from "./CategoryPicker";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { CalendarIcon, Loader2, Sparkles } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CreateTransaction } from "../_actions/transactions";
import { toast } from "sonner";
import { getRandomValues } from "crypto";
import { DateToUTCDate } from "@/lib/helper";
import { AITransactionInputSchema, AITransactionInputSchemaType } from "@/schema/ai-transaction";
import { CreateCategory } from "../_actions/categories";

interface Props {
  trigger: ReactNode;
  type: TransactionType;
}

const CreateTransactionDialog = ({ trigger, type }: Props) => {
  const isAIMode = type === "ai";
  const [aiProcessing, setAIProcessing] = useState(false);
  const [aiResult, setAIResult] = useState<any>(null);
  const [needsNewCategory, setNeedsNewCategory] = useState(false);
  
  // Form for regular transaction input
  const form = useForm<CreateTransactionSchemaType>({
    resolver: zodResolver(CreateTransactionSchema),
    defaultValues: {
      type: isAIMode ? "expense" : type, // Default to expense for AI mode
      date: new Date(),
    },
  });

  // Form for AI input
  const aiForm = useForm<AITransactionInputSchemaType>({
    resolver: zodResolver(AITransactionInputSchema),
    defaultValues: {
      text: "",
    },
  });

  const [open, setOpen] = useState(false);
  const handleCategoryChange = useCallback(
    (value: string) => {
      form.setValue("category", value);
    },
    [form]
  );

  const queryClient = useQueryClient();

  // Category creation mutation
  const { mutate: createCategory } = useMutation({
    mutationFn: CreateCategory,
    onSuccess: (category) => {
      toast.success(`Category ${category.name} created successfully 🎉`, {
        id: "create-category",
      });
      form.setValue("category", category.name);
      setNeedsNewCategory(false);
      
      // Invalidate categories query to refresh the list
      queryClient.invalidateQueries({
        queryKey: ["categories"],
      });
    },
    onError: () => {
      toast.error("Failed to create category", {
        id: "create-category",
      });
    },
  });

  // Transaction creation mutation
  const { mutate, isPending } = useMutation({
    mutationFn: CreateTransaction,
    onSuccess: () => {
      toast.success("Transaction has been successfully added 🎉", {
        id: "create-transaction",
      });

      // Reset the appropriate form
      if (isAIMode) {
        aiForm.reset({
          text: "",
        });
        setAIResult(null);
      }
      
      form.reset({
        type: isAIMode ? "expense" : type,
        description: "",
        amount: 0,
        date: new Date(),
        category: undefined,
      });

      queryClient.invalidateQueries({
        queryKey: ["overview"],
      });

      setOpen((prev) => !prev);
    },
  });

  // Process AI input
  const processAIInput = async (values: AITransactionInputSchemaType) => {
    setAIProcessing(true);
    toast.loading("Processing with AI...", {
      id: "ai-processing",
    });
    
    try {
      const response = await fetch("/api/ai-transaction", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: values.text }),
      });
      
      if (!response.ok) {
        throw new Error("Failed to process with AI");
      }
      
      const data = await response.json();
      // Normalize types to lowercase for compatibility
      const normalized = {
        transaction: {
          ...data.transaction,
          type: data.transaction.type.toLowerCase(),
        },
        category: {
          ...data.category,
          type: data.category.type.toLowerCase(),
          icon: data.category.icon,
        },
      };
      setAIResult(normalized);
      
      // Update the transaction form with AI results
      form.setValue("type", normalized.transaction.type);
      form.setValue("description", normalized.transaction.description || "");
      form.setValue("amount", normalized.transaction.amount);
      form.setValue("date", new Date(normalized.transaction.date));
      
      // Check if we need to create a new category
      if (!normalized.category.exists) {
        setNeedsNewCategory(true);
      } else {
        form.setValue("category", normalized.category.name);
      }
      
      toast.success("AI processing complete", {
        id: "ai-processing",
      });
    } catch (error) {
      console.error("AI processing error:", error);
      toast.error("Failed to process with AI", {
        id: "ai-processing",
      });
    } finally {
      setAIProcessing(false);
    }
  };

  // Create a new category based on AI suggestion
  const handleCreateCategory = useCallback(() => {
    if (!aiResult) return;
    
    toast.loading("Creating category...", {
      id: "create-category",
    });
    
    createCategory({
      name: aiResult.category.name,
      icon: aiResult.category.icon || "💼", // Use AI-suggested icon or default
      type: aiResult.category.type,
    });
  }, [aiResult, createCategory]);

  // Submit the transaction
  const onSubmit = useCallback(
    (values: CreateTransactionSchemaType) => {
      toast.loading("Creating transaction...", {
        id: "create-transaction",
      });

      mutate({
        ...values,
        date: DateToUTCDate(values.date),
      });
    },
    [mutate]
  );
  
  // Reset the AI form and results
  const resetAIForm = useCallback(() => {
    aiForm.reset({ text: "" });
    setAIResult(null);
  }, [aiForm]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isAIMode ? (
              <span className="flex items-center gap-2">
                Add transaction using AI <Sparkles className="h-5 w-5 text-yellow-500" />
              </span>
            ) : (
              <>
                Create a new{""}
                <span
                  className={cn(
                    "m-1",
                    type === "income" ? "text-emerald-500" : "text-red-500"
                  )}
                >
                  {type}
                </span>
                transaction
              </>
            )}
          </DialogTitle>
        </DialogHeader>

        {isAIMode && (
          <div className="mb-4 max-h-[70vh] overflow-y-auto pr-1">
            {!aiResult ? (
              <Form {...aiForm}>
                <form className="space-y-4">
                  <FormField
                    control={aiForm.control}
                    name="text"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Describe your transaction</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Example: Spent 250 on groceries yesterday"
                            className="min-h-24"
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>
                          Describe your transaction in natural language. Include details like amount, category, and date if applicable.
                        </FormDescription>
                      </FormItem>
                    )}
                  />
                  <Button 
                    type="button" 
                    onClick={aiForm.handleSubmit(processAIInput)}
                    disabled={aiProcessing}
                    className="w-full"
                  >
                    {aiProcessing ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <Sparkles className="mr-2 h-4 w-4" />
                        Analyze with AI
                      </>
                    )}
                  </Button>
                </form>
              </Form>
            ) : (
              <>
                <div className="flex justify-between items-center mb-3">
                  <h3 className="font-medium">AI Analysis Result</h3>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => {
                      setAIResult(null);
                      aiForm.reset();
                    }}
                    className="h-8 px-2 text-xs"
                  >
                    Try different text
                  </Button>
                </div>
                <div className="p-3 border rounded-md bg-muted/50 mb-4">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div><span className="font-medium">Type:</span> {aiResult.transaction.type}</div>
                    <div><span className="font-medium">Amount:</span> {aiResult.transaction.amount}</div>
                    <div><span className="font-medium">Description:</span> {aiResult.transaction.description || "N/A"}</div>
                    <div><span className="font-medium">Date:</span> {format(new Date(aiResult.transaction.date), "PPP")}</div>
                    <div className="col-span-2 flex items-center gap-2">
                      <span className="font-medium">Category:</span> 
                      {aiResult.category.icon && <span role="img">{aiResult.category.icon}</span>}
                      {aiResult.category.name}
                      {!aiResult.category.exists && (
                        <Button 
                          variant="link" 
                          size="sm" 
                          onClick={handleCreateCategory}
                          className="px-2 py-0 h-auto font-medium underline transition duration-200 text-accent-foreground hover:bg-accent/10 hover:shadow-sm hover:rounded-md"
                        >
                          Create this category
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
                
                <div className="border-t pt-4">
                  <h3 className="font-medium mb-2">Review and Edit Transaction Details:</h3>
                </div>
              </>
            )}
          </div>
        )}

        <Form {...form}>
          <form className="space-y-4 overflow-y-auto" onSubmit={form.handleSubmit(onSubmit)}>
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormDescription>
                    Transaction description (optional)
                  </FormDescription>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Amount</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" {...field} />
                  </FormControl>
                  <FormDescription>
                    Transaction amount (required)
                  </FormDescription>
                </FormItem>
              )}
            />

            <div className="flex items-center justify-between gap-2 flex-wrap md:flex-nowrap">
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem className="flex flex-col w-full md:w-auto">
                    <FormLabel>Category</FormLabel>
                    <FormControl>
                      <CategoryPicker
                        type={isAIMode ? form.watch("type") : type}
                        onChange={handleCategoryChange}
                      />
                    </FormControl>
                    <FormDescription>
                      Select a category for this transaction
                    </FormDescription>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="date"
                render={({ field }) => (
                  <FormItem className="flex flex-col w-full md:w-auto">
                    <FormLabel>Transaction Date</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant={"outline"}
                            className={cn(
                              "w-full md:w-[200px] pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            {field.value ? (
                              format(field.value, "PPP")
                            ) : (
                              <span>Pick a date</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={(value) => {
                            if (!value) return;
                            field.onChange(value);
                          }}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormDescription>
                      Select a date for this transaction
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {isAIMode && (
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Transaction Type</FormLabel>
                    <div className="flex gap-4">
                      <FormControl>
                        <div className="flex items-center space-x-2">
                          <Button
                            type="button"
                            variant={field.value === "income" ? "default" : "outline"}
                            className={cn(
                              field.value === "income" && "bg-emerald-600 hover:bg-emerald-700"
                            )}
                            onClick={() => form.setValue("type", "income")}
                          >
                            Income
                          </Button>
                          <Button
                            type="button"
                            variant={field.value === "expense" ? "default" : "outline"}
                            className={cn(
                              field.value === "expense" && "bg-rose-600 hover:bg-rose-700"
                            )}
                            onClick={() => form.setValue("type", "expense")}
                          >
                            Expense
                          </Button>
                        </div>
                      </FormControl>
                    </div>
                  </FormItem>
                )}
              />
            )}
          </form>
        </Form>
        <DialogFooter>
          <DialogClose asChild>
            <Button
              type="button"
              variant={"secondary"}
              onClick={() => {
                form.reset();
                if (isAIMode) {
                  resetAIForm();
                }
              }}
            >
              Cancel
            </Button>
          </DialogClose>
          <Button 
            onClick={form.handleSubmit(onSubmit)} 
            disabled={isPending || (isAIMode && needsNewCategory)}
          >
            {!isPending && "Create Transaction"}
            {isPending && <Loader2 className="animate-spin" />}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CreateTransactionDialog;
