import mongoose from 'mongoose';
import fs from 'fs';
const MONGO_URI = 'mongodb://developertesterdevops_db_user:VKfV1m3Nnz0mmt91@ac-yzuzcop-shard-00-00.9jionkh.mongodb.net:27017,ac-yzuzcop-shard-00-01.9jionkh.mongodb.net:27017,ac-yzuzcop-shard-00-02.9jionkh.mongodb.net:27017/?ssl=true&replicaSet=atlas-ikfxsn-shard-0&authSource=admin&appName=Cluster0';

mongoose.connect(MONGO_URI).then(async () => {
    const projects = await mongoose.connection.db.collection('projects').find().toArray();
    fs.writeFileSync('projects.json', JSON.stringify(projects, null, 2));
    
    const stores = await mongoose.connection.db.collection('stores').find().toArray();
    fs.writeFileSync('stores.json', JSON.stringify(stores, null, 2));

    process.exit();
}).catch(e => {
    fs.writeFileSync('db_error.txt', e.toString());
    process.exit(1);
});
