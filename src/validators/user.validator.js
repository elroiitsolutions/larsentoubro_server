import { z } from 'zod';

const createUser = z.object({
    body: z.object({
        name: z.string().min(2, "Name must be at least 2 characters long"),
        phonenumber: z.string().min(10, "Phone number must be at least 10 digits"),
        email: z.string().email("Invalid email format"),
        password: z.string().min(6, "Password must be at least 6 characters"),
        role: z.enum(['Admin', 'Manager', 'Engineer', 'Analyst', 'Viewer']),
        user_id: z.string().min(3, "User ID must be at least 3 characters")
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
    loginUser
};
