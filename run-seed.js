import { connectDB } from './src/config/db.js';
import { seedDatabase } from './src/utils/seed.js';

const run = async () => {
    await connectDB();
    await seedDatabase();
    console.log("Seeding complete!");
    process.exit(0);
};

run();
