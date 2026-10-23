import { connectDB } from '../config/db.js';
import { Store } from '../models/store.model.js';
import { Tool } from '../models/tool.model.js';

async function main() {
  await connectDB();
  const stores = await Store.find({}).populate('project', 'name');
  console.log(`Found ${stores.length} stores:`);
  
  for (const s of stores) {
    const totalCount = await Tool.countDocuments({
      $or: [{ currentSite: s._id }, { store: s._id }],
      isDeleted: { $ne: true },
      isScrapped: { $ne: true }
    });
    
    const availableCount = await Tool.countDocuments({
      $or: [{ currentSite: s._id }, { store: s._id }],
      isDeleted: { $ne: true },
      isScrapped: { $ne: true },
      status: 'Available'
    });

    const issuedCount = await Tool.countDocuments({
      $or: [{ currentSite: s._id }, { store: s._id }],
      isDeleted: { $ne: true },
      isScrapped: { $ne: true },
      status: { $in: ['Issued', 'Assigned', 'In Use'] }
    });

    const statusBreakdown = await Tool.aggregate([
      {
        $match: {
          $or: [{ currentSite: s._id }, { store: s._id }],
          isDeleted: { $ne: true },
          isScrapped: { $ne: true }
        }
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    console.log({
      id: s._id.toString(),
      name: s.name,
      project: s.project ? s.project.name : 'None',
      storedInventoryField: s.inventory,
      totalCount,
      availableCount,
      issuedCount,
      statusBreakdown
    });
  }
  process.exit(0);
}

main().catch(console.error);
