import { connectDB } from '../config/db.js';
import { User } from '../models/user.model.js';
import { Project } from '../models/project.model.js';
import { Store } from '../models/store.model.js';

async function addAdmin() {
    try {
        console.log('[Script] Connecting to MongoDB...');
        await connectDB();

        const email = 'chandruravichandran1536@gmail.com'.trim().toLowerCase();
        const existing = await User.findOne({ email });

        // Retrieve all available projects and stores to assign full access
        const allProjects = await Project.find({}, '_id');
        const allStores = await Store.find({}, '_id');

        const projectIds = allProjects.map(p => p._id);
        const storeIds = allStores.map(s => s._id);

        const allowedPages = [
            '/dashboard',
            '/projects',
            '/stores',
            '/tools',
            '/users',
            '/settings',
            '/challans',
            '/profiles',
            '/qr-scanner'
        ];

        const defaultPassword = 'Admin@123';

        if (existing) {
            existing.role = 'Admin';
            existing.name = existing.name || 'Chandru Ravichandran';
            existing.canCreateUser = true;
            existing.hasInspectionAccess = true;
            existing.allowedPages = allowedPages;
            if (projectIds.length > 0) existing.projects = projectIds;
            if (storeIds.length > 0) existing.stores = storeIds;
            existing.password = defaultPassword;
            await existing.save();

            console.log(`\n========================================`);
            console.log(`[Script] Successfully updated user to Admin!`);
            console.log(`Email:    ${existing.email}`);
            console.log(`Role:     ${existing.role}`);
            console.log(`User ID:  ${existing.user_id}`);
            console.log(`Password: ${defaultPassword}`);
            console.log(`========================================\n`);
        } else {
            // Find unique user_id
            let userId = 'ADMIN002';
            let counter = 2;
            while (await User.findOne({ user_id: userId })) {
                counter++;
                userId = `ADMIN${String(counter).padStart(3, '0')}`;
            }

            const newUser = new User({
                name: 'Chandru Ravichandran',
                phonenumber: '9940180382',
                email: email,
                password: defaultPassword,
                role: 'Admin',
                user_id: userId,
                canCreateUser: true,
                hasInspectionAccess: true,
                allowedPages: allowedPages,
                projects: projectIds,
                stores: storeIds
            });

            await newUser.save();

            console.log(`\n========================================`);
            console.log(`[Script] Successfully created new Admin user!`);
            console.log(`Email:    ${newUser.email}`);
            console.log(`Role:     ${newUser.role}`);
            console.log(`User ID:  ${newUser.user_id}`);
            console.log(`Password: ${defaultPassword}`);
            console.log(`========================================\n`);
        }

        process.exit(0);
    } catch (err) {
        console.error('[Script] Error adding admin user:', err);
        process.exit(1);
    }
}

addAdmin();
