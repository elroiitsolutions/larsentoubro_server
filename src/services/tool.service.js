const categories = ["Power Tools", "Hand Tools", "Safety Equipment", "Measuring Instruments", "Consumables"];
const statuses = ["Available", "In Use", "Maintenance", "Damaged", "Expired"];

function seedRandom(seed) {
    let x = Math.sin(seed++) * 10000;
    return x - Math.floor(x);
}

function generateToolsForStore(storeId) {
    let seed = 0;
    for (let i = 0; i < storeId.length; i++) {
        seed += storeId.charCodeAt(i);
    }
    
    const tools = [];
    for (let i = 1; i <= 1200; i++) {
        const catIdx = Math.floor(seedRandom(seed++) * categories.length);
        const statIdx = Math.floor(seedRandom(seed++) * statuses.length);
        const qty = Math.floor(seedRandom(seed++) * 100) + 1;
        
        const daysToAdd = Math.floor(seedRandom(seed++) * 1000);
        const expDate = new Date();
        expDate.setDate(expDate.getDate() + daysToAdd);
        
        const padId = i.toString().padStart(4, '0');
        tools.push({
            id: `${storeId}-T-${padId}`,
            toolId: `T-${padId}`,
            name: `${categories[catIdx].split(' ')[0]} Tool Model ${String.fromCharCode(65 + (i % 26))}${i}`,
            category: categories[catIdx],
            status: statuses[statIdx],
            quantity: qty,
            expiryDate: categories[catIdx] === "Consumables" ? expDate.toISOString().split('T')[0] : '—'
        });
    }
    return tools;
}

const getTools = async (storeId, { page = 1, limit = 10, search = '', category = '', status = '', sortBy = 'toolId', sortOrder = 'asc' }) => {
    let tools = generateToolsForStore(storeId);
    
    if (search) {
        const s = search.toLowerCase();
        tools = tools.filter(t => t.name.toLowerCase().includes(s) || t.toolId.toLowerCase().includes(s));
    }
    if (category && category !== 'All') {
        tools = tools.filter(t => t.category === category);
    }
    if (status && status !== 'All') {
        tools = tools.filter(t => t.status === status);
    }
    
    if (sortBy) {
        tools.sort((a, b) => {
            let valA = a[sortBy];
            let valB = b[sortBy];
            if (typeof valA === 'string') valA = valA.toLowerCase();
            if (typeof valB === 'string') valB = valB.toLowerCase();
            
            if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
            if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
            return 0;
        });
    }
    
    const total = tools.length;
    const skip = (page - 1) * limit;
    const paginatedTools = tools.slice(skip, skip + parseInt(limit));
    
    return {
        data: paginatedTools,
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit)
    };
};

export const toolService = {
    getTools
};
