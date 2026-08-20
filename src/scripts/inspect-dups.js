import { connectDB } from '../config/db.js';
import { Tool } from '../models/tool.model.js';
import { Project } from '../models/project.model.js';

const inspect = async () => {
    await connectDB();
    const existing = await Tool.find({ toolId: "TSPL008T0526TPI0001" }).lean();
    console.log("Existing tools with TSPL008T0526TPI0001:", existing);

    const projectTools = await Tool.find({ project: "6a5cf3737867fbcbece68358" }).countDocuments();
    console.log("Tools count for project 6a5cf3737867fbcbece68358:", projectTools);

    process.exit(0);
};

inspect().catch(console.error);
