import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve admin dashboard HTML
router.get('/dashboard', (req, res) => {
    const adminHTML = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Poppen Admin Dashboard</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
    <style>
        .sidebar {
            min-height: 100vh;
            background: linear-gradient(180deg, #667eea 0%, #764ba2 100%);
        }
        .content-area {
            background-color: #f8f9fa;
            min-height: 100vh;
        }
        .data-table {
            background: white;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .stat-card {
            background: white;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            transition: transform 0.2s;
            cursor: pointer;
        }
        .stat-card:hover {
            transform: translateY(-2px);
        }
        .nav-link {
            color: rgba(255,255,255,0.8) !important;
            transition: all 0.2s;
        }
        .nav-link:hover, .nav-link.active {
            color: white !important;
            background-color: rgba(255,255,255,0.1);
            border-radius: 8px;
        }
        .loading {
            display: none;
            text-align: center;
            padding: 20px;
        }
        .edit-form {
            background: white;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            padding: 20px;
        }
        .btn-action {
            margin: 2px;
        }
    </style>
</head>
<body>
    <div class="container-fluid">
        <div class="row">
            <!-- Sidebar -->
            <div class="col-md-2 sidebar p-3">
                <div class="text-center mb-4">
                    <h4 class="text-white"><i class="fas fa-fire"></i> Poppen Admin</h4>
                    <small class="text-white-50">Manage Your App Data</small>
                </div>
                
                <nav class="nav flex-column">
                    <a class="nav-link active" href="#" onclick="showDashboard()">
                        <i class="fas fa-tachometer-alt me-2"></i> Dashboard
                    </a>
                    <a class="nav-link" href="#" onclick="showCollection('users')">
                        <i class="fas fa-users me-2"></i> Users
                    </a>
                    <a class="nav-link" href="#" onclick="showCollection('posts')">
                        <i class="fas fa-image me-2"></i> Posts
                    </a>
                    <a class="nav-link" href="#" onclick="showCollection('places')">
                        <i class="fas fa-map-marker-alt me-2"></i> Places
                    </a>
                    <a class="nav-link" href="#" onclick="showCollection('messages')">
                        <i class="fas fa-comments me-2"></i> Messages
                    </a>
                    <a class="nav-link" href="#" onclick="showCollection('events')">
                        <i class="fas fa-calendar me-2"></i> Events
                    </a>
                    <a class="nav-link" href="#" onclick="showCollection('conversations')">
                        <i class="fas fa-comment-dots me-2"></i> Conversations
                    </a>
                </nav>
            </div>

            <!-- Main Content -->
            <div class="col-md-10 content-area p-4">
                <!-- Dashboard -->
                <div id="dashboard" class="content-section">
                    <h2 class="mb-4"><i class="fas fa-tachometer-alt me-2"></i>Poppen App Dashboard</h2>
                    
                    <div class="row mb-4" id="stats-cards">
                        <!-- Stats will be loaded here -->
                    </div>

                    <div class="row">
                        <div class="col-md-12">
                            <div class="stat-card p-4 mb-3">
                                <h5><i class="fas fa-info-circle me-2"></i>Admin Panel Features</h5>
                                <div class="row">
                                    <div class="col-md-4">
                                        <h6><i class="fas fa-eye text-primary me-2"></i>View Data</h6>
                                        <p class="text-muted">Browse all your Firebase collections in organized tables</p>
                                    </div>
                                    <div class="col-md-4">
                                        <h6><i class="fas fa-edit text-success me-2"></i>Edit Records</h6>
                                        <p class="text-muted">Update user profiles, posts, places, and more</p>
                                    </div>
                                    <div class="col-md-4">
                                        <h6><i class="fas fa-trash text-danger me-2"></i>Delete Items</h6>
                                        <p class="text-muted">Remove unwanted content with confirmation</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Data Table -->
                <div id="data-view" class="content-section" style="display: none;">
                    <div class="d-flex justify-content-between align-items-center mb-4">
                        <h2 id="collection-title"><i class="fas fa-table me-2"></i>Data</h2>
                        <div>
                            <button class="btn btn-secondary me-2" onclick="showDashboard()">
                                <i class="fas fa-arrow-left me-2"></i>Back to Dashboard
                            </button>
                            <button class="btn btn-success" onclick="refreshData()">
                                <i class="fas fa-sync me-2"></i>Refresh
                            </button>
                        </div>
                    </div>
                    
                    <div class="data-table p-3">
                        <div class="loading" id="loading">
                            <i class="fas fa-spinner fa-spin fa-2x text-primary"></i>
                            <p class="mt-2">Loading data...</p>
                        </div>
                        <div class="table-responsive">
                            <table class="table table-hover" id="data-table">
                                <thead class="table-dark">
                                    <tr id="table-header"></tr>
                                </thead>
                                <tbody id="table-body"></tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <!-- Edit Form -->
                <div id="edit-form" class="content-section" style="display: none;">
                    <div class="d-flex justify-content-between align-items-center mb-4">
                        <h2 id="form-title"><i class="fas fa-edit me-2"></i>Edit Item</h2>
                        <button class="btn btn-secondary" onclick="cancelEdit()">
                            <i class="fas fa-times me-2"></i>Cancel
                        </button>
                    </div>
                    
                    <div class="edit-form">
                        <form id="item-form">
                            <div id="form-fields"></div>
                            <div class="mt-4">
                                <button type="submit" class="btn btn-success me-2">
                                    <i class="fas fa-save me-2"></i>Save Changes
                                </button>
                                <button type="button" class="btn btn-danger" onclick="deleteItem()">
                                    <i class="fas fa-trash me-2"></i>Delete Item
                                </button>
                                <button type="button" class="btn btn-secondary" onclick="cancelEdit()">
                                    <i class="fas fa-times me-2"></i>Cancel
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
    <script>
        const API_BASE = window.location.origin;
        let currentCollection = '';
        let currentItem = null;

        // Initialize dashboard
        document.addEventListener('DOMContentLoaded', function() {
            showDashboard();
        });

        // Show dashboard
        async function showDashboard() {
            hideAllSections();
            document.getElementById('dashboard').style.display = 'block';
            updateActiveNav(0);
            await loadStats();
        }

        // Load statistics
        async function loadStats() {
            try {
                const response = await fetch(\`\${API_BASE}/api/v1/firestore/collections\`);
                const data = await response.json();
                
                const statsContainer = document.getElementById('stats-cards');
                statsContainer.innerHTML = '';

                if (data.success) {
                    for (let collection of data.data.collections) {
                        try {
                            const countResponse = await fetch(\`\${API_BASE}/api/v1/firestore/collections/\${collection.id}/documents?limit=100\`);
                            const countData = await countResponse.json();
                            const count = countData.data && countData.data.documents ? countData.data.documents.length : 0;
                            
                            const card = createStatCard(collection.id, count);
                            statsContainer.appendChild(card);
                        } catch (error) {
                            console.error(\`Error loading \${collection.id}:\`, error);
                            const card = createStatCard(collection.id, '?');
                            statsContainer.appendChild(card);
                        }
                    }
                }
            } catch (error) {
                console.error('Error loading stats:', error);
                document.getElementById('stats-cards').innerHTML = '<div class="col-12"><div class="alert alert-danger">Error loading dashboard data</div></div>';
            }
        }

        // Create stat card
        function createStatCard(name, count) {
            const col = document.createElement('div');
            col.className = 'col-md-3 mb-3';
            
            const icons = {
                users: 'fas fa-users text-primary',
                posts: 'fas fa-image text-success',
                places: 'fas fa-map-marker-alt text-info',
                messages: 'fas fa-comments text-warning',
                events: 'fas fa-calendar text-danger',
                conversations: 'fas fa-comment-dots text-secondary'
            };

            col.innerHTML = \`
                <div class="stat-card p-4 text-center" onclick="showCollection('\${name}')">
                    <i class="\${icons[name] || 'fas fa-database text-dark'} fa-3x mb-3"></i>
                    <h2 class="text-dark">\${count}</h2>
                    <h5 class="text-muted text-capitalize">\${name}</h5>
                    <small class="text-muted">Click to manage</small>
                </div>
            \`;
            
            return col;
        }

        // Show collection data
        async function showCollection(collectionName) {
            currentCollection = collectionName;
            hideAllSections();
            document.getElementById('data-view').style.display = 'block';
            document.getElementById('collection-title').innerHTML = \`<i class="fas fa-table me-2"></i>\${collectionName.charAt(0).toUpperCase() + collectionName.slice(1)} Management\`;
            
            updateActiveNav(collectionName);
            await loadCollectionData(collectionName);
        }

        // Load collection data
        async function loadCollectionData(collectionName) {
            const loading = document.getElementById('loading');
            const table = document.getElementById('data-table');
            
            loading.style.display = 'block';
            table.style.display = 'none';
            
            try {
                const response = await fetch(\`\${API_BASE}/api/v1/firestore/collections/\${collectionName}/documents\`);
                const data = await response.json();
                
                if (data.success && data.data.documents && data.data.documents.length > 0) {
                    buildTable(data.data.documents);
                } else {
                    document.getElementById('table-header').innerHTML = '<th>No Data</th>';
                    document.getElementById('table-body').innerHTML = '<tr><td class="text-center p-4">No records found in this collection</td></tr>';
                }
            } catch (error) {
                console.error('Error loading data:', error);
                document.getElementById('table-header').innerHTML = '<th>Error</th>';
                document.getElementById('table-body').innerHTML = '<tr><td class="text-center text-danger p-4">Error loading data</td></tr>';
            }
            
            loading.style.display = 'none';
            table.style.display = 'table';
        }

        // Build table
        function buildTable(documents) {
            const header = document.getElementById('table-header');
            const body = document.getElementById('table-body');
            
            // Get all unique keys
            const allKeys = new Set();
            documents.forEach(doc => {
                Object.keys(doc.data).forEach(key => allKeys.add(key));
            });
            
            // Build header - limit to important columns
            const keyHeaders = Array.from(allKeys).slice(0, 5);
            header.innerHTML = '<th>ID</th>' + keyHeaders.map(key => \`<th>\${key}</th>\`).join('') + '<th width="120">Actions</th>';
            
            // Build body
            body.innerHTML = documents.map(doc => {
                const cells = keyHeaders.map(key => {
                    let value = doc.data[key];
                    if (typeof value === 'object') {
                        value = JSON.stringify(value);
                    }
                    if (typeof value === 'string' && value.length > 30) {
                        value = value.substring(0, 30) + '...';
                    }
                    return \`<td title="\${encodeURIComponent(JSON.stringify(doc.data[key]))}">\${value || '-'}</td>\`;
                }).join('');
                
                const escapedData = JSON.stringify(doc.data).replace(/"/g, '&quot;');
                
                return \`
                    <tr>
                        <td><code style="font-size: 0.8em;">\${doc.id}</code></td>
                        \${cells}
                        <td>
                            <button class="btn btn-sm btn-primary btn-action" onclick="editItem('\${doc.id}', \${escapedData})" title="Edit">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn btn-sm btn-danger btn-action" onclick="deleteItemConfirm('\${doc.id}')" title="Delete">
                                <i class="fas fa-trash"></i>
                            </button>
                        </td>
                    </tr>
                \`;
            }).join('');
        }

        // Edit item
        function editItem(id, data) {
            currentItem = { id, data };
            hideAllSections();
            document.getElementById('edit-form').style.display = 'block';
            document.getElementById('form-title').innerHTML = \`<i class="fas fa-edit me-2"></i>Edit \${currentCollection} - \${id}\`;
            
            buildEditForm(data);
        }

        // Build edit form
        function buildEditForm(data) {
            const container = document.getElementById('form-fields');
            container.innerHTML = Object.keys(data).map(key => {
                let value = data[key];
                let inputType = 'text';
                
                if (typeof value === 'object') {
                    value = JSON.stringify(value, null, 2);
                    return \`
                        <div class="mb-3">
                            <label class="form-label"><strong>\${key}</strong> <small class="text-muted">(JSON Object)</small></label>
                            <textarea class="form-control" name="\${key}" rows="3">\${value || ''}</textarea>
                        </div>
                    \`;
                } else if (typeof value === 'boolean') {
                    return \`
                        <div class="mb-3">
                            <label class="form-label"><strong>\${key}</strong></label>
                            <select class="form-select" name="\${key}">
                                <option value="true" \${value === true ? 'selected' : ''}>True</option>
                                <option value="false" \${value === false ? 'selected' : ''}>False</option>
                            </select>
                        </div>
                    \`;
                } else if (key.toLowerCase().includes('email')) {
                    inputType = 'email';
                } else if (key.toLowerCase().includes('url') || key.toLowerCase().includes('website')) {
                    inputType = 'url';
                }
                
                return \`
                    <div class="mb-3">
                        <label class="form-label"><strong>\${key}</strong></label>
                        <input type="\${inputType}" class="form-control" name="\${key}" value="\${value || ''}" />
                    </div>
                \`;
            }).join('');
        }

        // Save changes
        document.getElementById('item-form').addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const formData = new FormData(e.target);
            const updateData = {};
            
            for (let [key, value] of formData.entries()) {
                try {
                    if (value === 'true') updateData[key] = true;
                    else if (value === 'false') updateData[key] = false;
                    else if (value.startsWith('{') || value.startsWith('[')) {
                        updateData[key] = JSON.parse(value);
                    } else {
                        updateData[key] = value;
                    }
                } catch {
                    updateData[key] = value;
                }
            }
            
            try {
                const response = await fetch(\`\${API_BASE}/api/v1/firestore/collections/\${currentCollection}/documents/\${currentItem.id}\`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(updateData)
                });
                
                if (response.ok) {
                    alert('✅ Item updated successfully!');
                    showCollection(currentCollection);
                } else {
                    alert('❌ Error updating item');
                }
            } catch (error) {
                console.error('Error:', error);
                alert('❌ Error updating item');
            }
        });

        // Delete item confirmation
        function deleteItemConfirm(id) {
            if (confirm(\`Are you sure you want to delete item \${id}?\\n\\nThis action cannot be undone.\`)) {
                deleteItemById(id);
            }
        }

        // Delete item by ID
        async function deleteItemById(id) {
            try {
                const response = await fetch(\`\${API_BASE}/api/v1/firestore/collections/\${currentCollection}/documents/\${id}\`, {
                    method: 'DELETE'
                });
                
                if (response.ok) {
                    alert('✅ Item deleted successfully!');
                    loadCollectionData(currentCollection);
                } else {
                    alert('❌ Error deleting item');
                }
            } catch (error) {
                console.error('Error:', error);
                alert('❌ Error deleting item');
            }
        }

        // Delete current item (from edit form)
        async function deleteItem() {
            if (!confirm(\`Are you sure you want to delete this \${currentCollection} item?\\n\\nThis action cannot be undone.\`)) return;
            
            try {
                const response = await fetch(\`\${API_BASE}/api/v1/firestore/collections/\${currentCollection}/documents/\${currentItem.id}\`, {
                    method: 'DELETE'
                });
                
                if (response.ok) {
                    alert('✅ Item deleted successfully!');
                    showCollection(currentCollection);
                } else {
                    alert('❌ Error deleting item');
                }
            } catch (error) {
                console.error('Error:', error);
                alert('❌ Error deleting item');
            }
        }

        // Refresh data
        function refreshData() {
            if (currentCollection) {
                loadCollectionData(currentCollection);
            }
        }

        // Helper functions
        function hideAllSections() {
            document.querySelectorAll('.content-section').forEach(section => {
                section.style.display = 'none';
            });
        }

        function updateActiveNav(target) {
            document.querySelectorAll('.nav-link').forEach(link => {
                link.classList.remove('active');
            });
            
            if (typeof target === 'number') {
                document.querySelectorAll('.nav-link')[target].classList.add('active');
            } else {
                document.querySelectorAll('.nav-link').forEach(link => {
                    if (link.textContent.toLowerCase().includes(target)) {
                        link.classList.add('active');
                    }
                });
            }
        }

        function cancelEdit() {
            showCollection(currentCollection);
        }
    </script>
</body>
</html>
    `;
    
    res.send(adminHTML);
});

export default router; 