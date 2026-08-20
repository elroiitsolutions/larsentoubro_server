import { connectDB } from '../config/db.js';
import { Tool } from '../models/tool.model.js';
import { Project } from '../models/project.model.js';
import { Counter } from '../models/counter.model.js';
import ToolIdGenerator from '../utils/tool-id.js';

const fixSerials = async () => {
    await connectDB();
    console.log("[FixScript] Database connected");

    // Drop old single-field global unique index on toolId if present
    try {
        await Tool.collection.dropIndex('toolId_1');
        console.log("[FixScript] Dropped old single-field toolId_1 index");
    } catch (e) {
        console.log("[FixScript] Single-field toolId_1 index did not exist or already dropped");
    }

    const projects = await Project.find({}).lean();
    console.log(`[FixScript] Found ${projects.length} projects`);

    for (const proj of projects) {
        const projIdStr = proj._id.toString();
        const query = {
            $or: [
                { project: projIdStr },
                { project: proj._id }
            ]
        };

        const tools = await Tool.find(query).sort({ createdAt: 1, _id: 1 });

        if (tools.length === 0) continue;

        console.log(`[FixScript] Resequencing Project ${proj.name || projIdStr} with ${tools.length} tools...`);

        // Step 1: Temporarily prefix all toolId values to avoid unique index collisions during updates
        const tempOps = tools.map(tool => ({
            updateOne: {
                filter: { _id: tool._id },
                update: { $set: { toolId: `TEMP_${tool._id}_${tool.toolId}` } }
            }
        }));
        await Tool.bulkWrite(tempOps);

        // Step 2: Write final sequential serial numbers (0001 -> N)
        const finalOps = tools.map((tool, index) => {
            const newSerial = index + 1;
            const newToolId = ToolIdGenerator.generateToolId(tool, newSerial);
            const newQrLink = ToolIdGenerator.generateQrLink(newToolId);

            return {
                updateOne: {
                    filter: { _id: tool._id },
                    update: {
                        $set: {
                            serialNumber: newSerial,
                            toolId: newToolId,
                            qrLink: newQrLink
                        }
                    }
                }
            };
        });

        await Tool.bulkWrite(finalOps);
        console.log(`[FixScript] Successfully updated ${tools.length} tools for Project ${proj.name || projIdStr}`);

        const counterId = `tool_serial_project_${projIdStr}`;
        await Counter.findByIdAndUpdate(counterId, { seq: tools.length }, { upsert: true });
        console.log(`[FixScript] Updated counter ${counterId} to ${tools.length}`);
    }

    console.log("[FixScript] Complete!");
    process.exit(0);
};

fixSerials().catch(err => {
    console.error("[FixScript] Error:", err);
    process.exit(1);
});
