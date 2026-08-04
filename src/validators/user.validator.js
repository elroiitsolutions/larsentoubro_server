import { z } from 'zod';

const createUser = z.object({
    body: z.object({
        name: z.string().min(2, "Name must be at least 2 characters long"),
        phonenumber: z.string().min(1, "Phone number is required"),
        email: z.string().email("Invalid email format"),
        password: z.string().min(6, "Password must be at least 6 characters"),
        role: z.enum(['Admin', 'User', 'Vendor']).default('User'),
        user_id: z.string().min(1, "User ID is required"),
        allowedPages: z.array(z.string()).optional(),
        projects: z.array(z.any()).optional(),
        stores: z.array(z.any()).optional()
    })
});

const updateUser = z.object({
    body: z.object({
        name: z.string().min(2, "Name must be at least 2 characters long").optional(),
        phonenumber: z.string().optional(),
        email: z.string().email("Invalid email format").optional(),
        password: z.string().min(6, "Password must be at least 6 characters").optional().or(z.literal('')),
        role: z.enum(['Admin', 'User', 'Vendor']).optional(),
        user_id: z.string().optional(),
        allowedPages: z.array(z.string()).optional(),
        projects: z.array(z.any()).optional(),
        stores: z.array(z.any()).optional()
    })
});

const loginUser = z.object({
    body: z.object({
        email: z.string().email("Invalid email format"),
        password: z.string().min(6, "Password must be at least 6 characters")
    })
});

export const userValidator = {
    createUser,
    updateUser,
    loginUser
};
