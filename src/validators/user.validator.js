import { z } from 'zod';

const createUser = z.object({
    body: z.object({
        name: z.string().min(2, "Name must be at least 2 characters long"),
        phonenumber: z.string().min(1, "Phone number is required"),
        email: z.string().email("Invalid email format"),
        password: z.string().min(6, "Password must be at least 6 characters"),
        role: z.enum(['Admin', 'User', 'Subuser', 'Vendor']).default('User'),
        user_id: z.string().min(1, "User ID is required"),
        parentUser: z.string().optional().nullable(),
        canCreateUser: z.boolean().optional(),
        hasInspectionAccess: z.boolean().optional(),
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
        role: z.enum(['Admin', 'User', 'Subuser', 'Vendor']).optional(),
        user_id: z.string().optional(),
        parentUser: z.string().optional().nullable(),
        canCreateUser: z.boolean().optional(),
        hasInspectionAccess: z.boolean().optional(),
        allowedPages: z.array(z.string()).optional(),
        projects: z.array(z.any()).optional(),
        stores: z.array(z.any()).optional()
    })
});

const requestOtp = z.object({
    body: z.object({
        email: z.string().email("Invalid email format")
    })
});

const verifyOtp = z.object({
    body: z.object({
        email: z.string().email("Invalid email format"),
        otp: z.string().min(6, "Verification code must be 6 digits").max(6, "Verification code must be 6 digits")
    })
});

const loginUser = z.object({
    body: z.object({
        email: z.string().email("Invalid email format"),
        password: z.string().optional(),
        otp: z.string().optional()
    })
});

export const userValidator = {
    createUser,
    updateUser,
    loginUser,
    requestOtp,
    verifyOtp
};
