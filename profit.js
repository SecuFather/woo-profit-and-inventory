class ConfigManager {
    constructor() {
        this.storage = localStorage;
    }

    get(key, defaultValue = 0) {
        const val = this.storage.getItem(key);
        return val === null ? defaultValue : parseFloat(val);
    }

    set(key, value) {
        this.storage.setItem(key, value);
    }

    getProductCost(productName) {
        return this.get(productName, null);
    }

    setProductCost(productName, cost) {
        this.set(productName, cost);
    }

    getProductStock(productName) {
        const val = this.storage.getItem('$stock_' + productName);
        return val === null ? null : parseFloat(val);
    }

    setProductStock(productName, stock) {
        this.set('$stock_' + productName, stock);
    }

    getAdsTimeline() {
        const timeline = {};
        for (let i = 0; i < this.storage.length; i++) {
            const key = this.storage.key(i);
            if (key && key.startsWith('$ads_') && key !== '$ads_cost_per_day') {
                const datePart = key.replace('$ads_', '');
                // Verify date format YYYY-MM-DD
                if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
                    timeline[datePart] = this.get(key);
                }
            }
        }
        return timeline;
    }

    setAdsCostForDate(date, cost) {
        // Store as flat key $ads_YYYY-MM-DD
        this.set('$ads_' + date, cost);
    }

    getAdsCostForDate(dateStr) {
        // Logic: Find the latest defined date <= dateStr
        const timeline = this.getAdsTimeline();
        const dates = Object.keys(timeline).sort();

        let effectiveCost = this.get('$ads_cost_per_day', 0); // Default

        for (const d of dates) {
            if (d <= dateStr) {
                effectiveCost = timeline[d];
            } else {
                break; // Future change point
            }
        }
        return effectiveCost;
    }

    getGlobals() {
        return {
            ads_cost_per_day: this.get('$ads_cost_per_day', 0),
            fixed_cost_per_day: this.get('$fixed_cost_per_day', 0),
            payment_fee_percent: this.get('$payment_fee_percent', 0),
            revenue_tax_percent: this.get('$revenue_tax_percent', 0),
            allegro_fee_percent: this.get('$allegro_fee_percent', 0)
        };
    }

    findSimilarProducts(targetName) {
        let matches = [];

        for (let i = 0; i < this.storage.length; i++) {
            const key = this.storage.key(i);
            // Skip globals and timeline keys
            if (!key || key.startsWith('$')) continue;

            const lcs = this.longestCommonSubstring(targetName.toLowerCase(), key.toLowerCase());

            // Heuristic: LCS > 3
            if (lcs > 3) {
                matches.push({ name: key, cost: this.get(key), score: lcs });
            }
        }

        // Sort by score (descending) and take top 3
        matches.sort((a, b) => b.score - a.score);
        return matches.slice(0, 3);
    }

    longestCommonSubstring(str1, str2) {
        if (!str1 || !str2) return 0;
        const m = str1.length;
        const n = str2.length;
        const dp = Array(m + 1).fill(0).map(() => Array(n + 1).fill(0));
        let max = 0;

        for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
                if (str1[i - 1] === str2[j - 1]) {
                    dp[i][j] = dp[i - 1][j - 1] + 1;
                    max = Math.max(max, dp[i][j]);
                }
            }
        }
        return max;
    }

    saveDailyData(date, stats) {
        this.set('$db_' + date, JSON.stringify(stats));
    }

    getDailyData(date) {
        const val = this.storage.getItem('$db_' + date);
        return val ? JSON.parse(val) : null;
    }

    getLastInventoryUpdateDate() {
        return this.storage.getItem('$last_inventory_update');
    }

    setLastInventoryUpdateDate(date) {
        this.storage.setItem('$last_inventory_update', date);
    }

    getAvailableDates() {
        const dates = [];
        for (let i = 0; i < this.storage.length; i++) {
            const key = this.storage.key(i);
            if (key && key.startsWith('$db_')) {
                dates.push(key.replace('$db_', ''));
            }
        }
        return dates.sort();
    }

    getBackupData() {
        const data = {};
        for (let i = 0; i < this.storage.length; i++) {
            const key = this.storage.key(i);
            if (key) {
                data[key] = this.storage.getItem(key);
            }
        }
        return JSON.stringify(data, null, 2);
    }

    restoreBackupData(jsonString) {
        try {
            const data = JSON.parse(jsonString);
            if (data && typeof data === 'object') {
                this.storage.clear();
                Object.keys(data).forEach(key => {
                    this.storage.setItem(key, data[key]);
                });
                return true;
            }
        } catch (e) {
            console.error('Restore failed', e);
            return false;
        }
        return false;
    }
}

class Profit {
    constructor() {
        this.config = new ConfigManager();
        this.data = [];
        this.lastCSVText = null;
        this.lastInventoryText = null;
        this.initUI();
    }

    initUI() {
        document.body.innerHTML = '';
        document.body.style.fontFamily = 'sans-serif';
        document.body.style.padding = '20px';
        document.body.style.color = '#333';

        const container = document.createElement('div');
        container.style.maxWidth = '1100px';
        container.style.margin = '0 auto';
        document.body.appendChild(container);

        // Backup Controls (NOW AT THE TOP of toggleable section)
        this.backupControls = document.createElement('div');
        this.backupControls.style.display = 'none';
        this.backupControls.style.marginBottom = '10px';
        this.backupControls.style.padding = '15px';
        this.backupControls.style.border = '1px solid #ddd';
        this.backupControls.style.borderRadius = '8px';
        this.backupControls.style.background = '#fff';
        this.backupControls.innerHTML = '<h3 style="margin-top:0">Backup & Restore</h3>';

        const dlLink = document.createElement('a');
        dlLink.textContent = 'Download Backup';
        dlLink.style.display = 'inline-block';
        dlLink.style.padding = '8px 15px';
        dlLink.style.marginRight = '15px';
        dlLink.style.background = '#f8f9fa';
        dlLink.style.border = '1px solid #ddd';
        dlLink.style.borderRadius = '4px';
        dlLink.style.color = '#333';
        dlLink.style.textDecoration = 'none';
        dlLink.style.fontSize = '13px';
        dlLink.style.cursor = 'pointer';

        dlLink.onclick = (e) => {
            const data = this.config.getBackupData();
            const date = new Date().toISOString().split('T')[0];
            const hash = Math.random().toString(16).substring(2, 8);
            dlLink.href = 'data:text/plain;charset=utf-8,' + encodeURIComponent(data);
            dlLink.download = `profit-${date}-${hash}.txt`;
        };
        this.backupControls.appendChild(dlLink);

        const restoreLabel = document.createElement('label');
        restoreLabel.textContent = 'Restore from file: ';
        this.backupControls.appendChild(restoreLabel);

        const restoreInput = document.createElement('input');
        restoreInput.type = 'file';
        restoreInput.accept = '.json,.txt';
        restoreInput.onchange = (e) => this.handleRestore(e);
        this.backupControls.appendChild(restoreInput);

        container.appendChild(this.backupControls);

        const controls = document.createElement('div');
        controls.id = 'settingsPanel';
        controls.style.display = 'none'; // Hidden by default
        controls.style.marginBottom = '20px';
        controls.style.padding = '15px';
        controls.style.background = '#f5f5f5';
        controls.style.borderRadius = '8px';
        container.appendChild(controls);

        this.renderConfigInputs(controls);

        const uploadLabel = document.createElement('div');
        uploadLabel.textContent = 'Upload WooCommerce Orders CSV:';
        uploadLabel.style.marginTop = '15px';
        uploadLabel.style.marginBottom = '5px';
        uploadLabel.style.fontWeight = 'bold';
        controls.appendChild(uploadLabel);

        this.upload = document.createElement('input');
        this.upload.type = 'file';
        this.upload.accept = '.csv';
        controls.appendChild(this.upload);

        this.output = document.createElement('div');
        container.appendChild(this.output);

        this.upload.addEventListener('change', (e) => this.handleFileUpload(e));

        const invLabel = document.createElement('div');
        invLabel.textContent = 'Import Stock Levels (WooCommerce Product Report):';
        invLabel.style.marginTop = '15px';
        invLabel.style.marginBottom = '5px';
        invLabel.style.fontWeight = 'bold';
        controls.appendChild(invLabel);

        this.invUpload = document.createElement('input');
        this.invUpload.type = 'file';
        this.invUpload.accept = '.csv';
        controls.appendChild(this.invUpload);

        this.invUpload.addEventListener('change', (e) => this.handleInventoryUpload(e));

        // Report Control Section
        const reportControls = document.createElement('div');
        reportControls.id = 'reportControls';
        reportControls.style.marginBottom = '20px';
        reportControls.style.padding = '15px';
        reportControls.style.background = '#e9ecef';
        reportControls.style.borderRadius = '8px';
        reportControls.style.display = 'flex';
        reportControls.style.alignItems = 'center';
        reportControls.style.flexWrap = 'wrap';
        reportControls.style.gap = '15px';

        const dateWrapper = document.createElement('div');
        dateWrapper.style.display = 'flex';
        dateWrapper.style.alignItems = 'center';
        dateWrapper.style.gap = '10px';

        // Auto-set range from DB if available
        const dates = this.config.getAvailableDates();
        const minDate = dates.length > 0 ? dates[0] : '';
        const maxDate = dates.length > 0 ? dates[dates.length - 1] : '';

        // Start Date
        const startInput = document.createElement('input');
        startInput.type = 'date';
        startInput.id = 'reportStart';
        if (minDate) startInput.value = minDate;

        const endInput = document.createElement('input');
        endInput.type = 'date';
        endInput.id = 'reportEnd';
        if (maxDate) endInput.value = maxDate;

        const fromSpan = document.createElement('span');
        fromSpan.textContent = 'From:';
        dateWrapper.appendChild(fromSpan);
        dateWrapper.appendChild(startInput);
        const toSpan = document.createElement('span');
        toSpan.textContent = 'To:';
        dateWrapper.appendChild(toSpan);
        dateWrapper.appendChild(endInput);

        const btnWrapper = document.createElement('div');
        btnWrapper.style.display = 'flex';
        btnWrapper.style.gap = '10px';

        const toggleBtn = document.createElement('button');
        toggleBtn.textContent = '⚙️ Settings';
        toggleBtn.title = 'Settings & Import';
        toggleBtn.style.padding = '8px 12px';
        toggleBtn.style.background = '#f8f9fa';
        toggleBtn.style.border = '1px solid #ddd';
        toggleBtn.style.borderRadius = '4px';
        toggleBtn.style.cursor = 'pointer';
        toggleBtn.onclick = () => {
            const isHidden = controls.style.display === 'none';
            controls.style.display = isHidden ? 'block' : 'none';
            this.backupControls.style.display = isHidden ? 'block' : 'none';
        };

        const genBtn = document.createElement('button');
        genBtn.textContent = 'Generate Profit Report';
        genBtn.style.padding = '8px 15px';
        genBtn.style.background = '#007bff';
        genBtn.style.color = 'white';
        genBtn.style.border = 'none';
        genBtn.style.borderRadius = '4px';
        genBtn.style.cursor = 'pointer';

        genBtn.onclick = () => {
            this.generateReportFromDB(startInput.value, endInput.value);
        };

        const genInvBtn = document.createElement('button');
        genInvBtn.textContent = 'Generate Inventory Report';
        genInvBtn.style.padding = '8px 15px';
        genInvBtn.style.background = '#17a2b8';
        genInvBtn.style.color = 'white';
        genInvBtn.style.border = 'none';
        genInvBtn.style.borderRadius = '4px';
        genInvBtn.style.cursor = 'pointer';

        genInvBtn.onclick = () => {
            this.generateInventoryFromDB(startInput.value, endInput.value);
        };

        reportControls.appendChild(dateWrapper);
        btnWrapper.appendChild(toggleBtn);
        btnWrapper.appendChild(genBtn);
        btnWrapper.appendChild(genInvBtn);
        reportControls.appendChild(btnWrapper);
        container.appendChild(reportControls);

        this.output = document.createElement('div');
        container.appendChild(this.output);
    }

    handleRestore(e) {
        const file = e.target.files[0];
        if (!file) return;

        if (!confirm('WARNING: This will overwrite ALL current data (settings, product costs, database). Are you sure?')) {
            e.target.value = ''; // Reset input
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const success = this.config.restoreBackupData(e.target.result);
            if (success) {
                alert('Backup restored successfully! Page will reload.');
                window.location.reload();
            } else {
                alert('Failed to restore backup. Invalid JSON file.');
            }
        };
        reader.readAsText(file);
    }

    renderConfigInputs(parent) {
        // ... (Keep existing implementation, but remove 'Recalculate Report' button as we have the new generator)
        // Actually, user might still want Recalculate contextually? 
        // But "Recalculate" usually meant "re-run processCSV". 
        // Now processCSV just imports. 
        // We will remove the old Recalculate button to avoid confusion, 
        // or repurpose it to "Clear DB"? No, keep it simple.

        const globals = this.config.getGlobals();
        const configDiv = document.createElement('div');
        configDiv.style.display = 'grid';
        configDiv.style.gridTemplateColumns = '1fr 1fr';
        configDiv.style.gap = '10px';

        Object.keys(globals).forEach(key => {
            const wrapper = document.createElement('div');
            const label = document.createElement('label');
            label.textContent = key.replace('$', '').replace(/_/g, ' ') + ': ';
            label.style.display = 'block';
            label.style.fontSize = '0.9em';

            const input = document.createElement('input');
            input.type = 'number';
            input.step = '0.01';
            input.value = globals[key];
            input.style.width = '100%';
            input.style.padding = '5px';

            input.addEventListener('change', (e) => {
                this.config.set('$' + key, e.target.value);
            });

            wrapper.appendChild(label);
            wrapper.appendChild(input);
            configDiv.appendChild(wrapper);
        });
        parent.appendChild(configDiv);
    }

    handleFileUpload(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => this.processCSV(e.target.result);
        reader.readAsText(file);
    }

    processCSV(text) {
        // ... (Parsing logic remains, but end result changes)
        // We will use the existing parsing code but instead of "generateReport(dailyStats)",
        // we will "save to DB" and then "alert success".

        this.lastCSVText = text;
        const lines = text.split('\n');
        const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());

        const dataIdx = headers.indexOf('Data');
        const statusIdx = headers.indexOf('Status');
        const salesIdx = headers.indexOf('Sprzedaż netto');
        const incomeIdx = headers.indexOf('Przychód netto (sformatowany)');
        const productsIdx = headers.indexOf('Produkt(y)');
        const emailIdx = headers.indexOf('Customer Email') > -1 ? headers.indexOf('Customer Email') : headers.indexOf('Email');
        const idIdx = headers.indexOf('Numer zamówienia') > -1 ? headers.indexOf('Numer zamówienia') : 0;

        const missingHeaders = [];
        if (dataIdx === -1) missingHeaders.push('Data');
        if (salesIdx === -1) missingHeaders.push('Sprzedaż netto');
        if (incomeIdx === -1) missingHeaders.push('Przychód netto (sformatowany)');
        if (productsIdx === -1) missingHeaders.push('Produkt(y)');

        if (missingHeaders.length > 0) {
            console.error('Missing headers:', missingHeaders, headers);
            alert(`Invalid CSV format. Missing: ${missingHeaders.join(', ')}`);
            return;
        }

        const dailyStats = {};
        const missingProducts = new Set();
        const globals = this.config.getGlobals();

        for (let i = 1; i < lines.length; i++) {
            const row = this.parseCSVLine(lines[i]);

            if (!row || row.length < headers.length) continue;

            const dateStr = row[dataIdx].split(' ')[0];
            if (!dateStr) continue;

            // ... (Value parsing - reused)
            const salesStr = row[salesIdx].replace(/\u00a0zł/g, '').replace(/,/g, '.').trim();
            const sales = parseFloat(salesStr) || 0;
            const incomeStr = row[incomeIdx].replace(/\u00a0zł/g, '').replace(/,/g, '.').trim();
            const income = parseFloat(incomeStr) || 0;
            const orderId = row[idIdx];
            const productsStr = row[productsIdx];

            let isAllegro = false;
            if (emailIdx > -1) {
                const email = row[emailIdx] || '';
                if (email.includes('allegromail')) { isAllegro = true; }
            }

            if (!dailyStats[dateStr]) {
                dailyStats[dateStr] = { sales: 0, income: 0, product_costs: 0, fees: 0, count: 0, ordersList: [] };
            }

            const order = {
                id: orderId,
                sales: sales,
                income: income,
                product_costs: 0,
                is_allegro: isAllegro,
                products_summary: productsStr
            };

            dailyStats[dateStr].sales += sales;
            dailyStats[dateStr].income += income;
            dailyStats[dateStr].count += 1;

            let fee = 0;
            if (isAllegro) {
                fee = sales * (globals.allegro_fee_percent / 100);
            } else {
                fee = income * (globals.payment_fee_percent / 100);
            }
            dailyStats[dateStr].fees += fee;
            order.fees = fee;

            if (productsStr) {
                const products = productsStr.split(', ');
                products.forEach(p => {
                    const parts = p.split('× ');
                    if (parts.length === 2) {
                        const qty = parseInt(parts[0]);
                        const name = parts[1].trim();
                        const cost = this.config.getProductCost(name);
                        if (cost === null) {
                            missingProducts.add(name);
                        } else {
                            const lineCost = cost * qty;
                            order.product_costs += lineCost;
                            dailyStats[dateStr].product_costs += lineCost;
                        }
                    }
                });
            }
            dailyStats[dateStr].ordersList.push(order);
        }

        if (missingProducts.size > 0) {
            this.promptForMissingCosts(Array.from(missingProducts), dailyStats, true); // True for "isImport"
        } else if (Object.keys(dailyStats).length > 0) {
            // Save to DB
            Object.keys(dailyStats).forEach(date => {
                this.config.saveDailyData(date, dailyStats[date]);
            });
            alert(`Imported ${Object.keys(dailyStats).length} days of data. Please set the date range and generate the report.`);

            // Refresh date pickers
            const availDates = this.config.getAvailableDates();
            if (availDates.length > 0) {
                document.getElementById('reportStart').value = availDates[0];
                document.getElementById('reportEnd').value = availDates[availDates.length - 1];
            }
        } else {
            alert('No valid data found.');
        }
    }

    handleInventoryUpload(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            this.lastInventoryText = e.target.result;
            this.processInventoryCSV(this.lastInventoryText);
        };
        reader.readAsText(file);
    }

    processInventoryCSV(text) {
        const lines = text.split('\n');
        const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());

        // Find Stock index (the primary anchor)
        let stockIdx = headers.indexOf('Stan magazynowy');

        // Find Title index with fallbacks
        let titleIdx = headers.indexOf('Tytuł produktu');
        if (titleIdx === -1) titleIdx = headers.indexOf('Produkt');
        if (titleIdx === -1) titleIdx = headers.indexOf('Nazwa');
        if (titleIdx === -1) titleIdx = 0; // Default to first column if no title-like header found

        const missing = [];
        if (stockIdx === -1) missing.push('Stan magazynowy');

        if (missing.length > 0) {
            alert(`Missing required column in Stock CSV: ${missing.join(', ')}`);
            return;
        }

        let count = 0;
        for (let i = 1; i < lines.length; i++) {
            const row = this.parseCSVLine(lines[i]);
            if (!row || row.length < Math.max(titleIdx, stockIdx) + 1) continue;

            const title = row[titleIdx];
            const stock = parseFloat(row[stockIdx]) || 0;
            if (title) {
                this.config.setProductStock(title, stock);
                count++;
            }
        }

        const today = new Date().toISOString().split('T')[0];
        this.config.setLastInventoryUpdateDate(today);

        alert(`Updated stock levels for ${count} products. Last update: ${today}`);
    }

    generateInventoryFromDB(startStr, endStr) {
        if (!startStr || !endStr) {
            alert('Please select both start and end dates.');
            return;
        }

        const startDate = new Date(startStr);
        const endDate = new Date(endStr);
        const diffTime = Math.abs(endDate - startDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

        const productSales = {}; // name -> count

        let current = new Date(startDate);
        while (current <= endDate) {
            const dateStr = current.toISOString().split('T')[0];
            const data = this.config.getDailyData(dateStr);
            if (data && data.ordersList) {
                data.ordersList.forEach(order => {
                    // Extract products from summary (again, unfortunately we need to parse if not stored separately)
                    // The ordersList has products_summary: "1 × Product A, 2 × Product B"
                    if (order.products_summary) {
                        const items = order.products_summary.split(', ');
                        items.forEach(item => {
                            const parts = item.split('× ');
                            if (parts.length === 2) {
                                const qty = parseInt(parts[0]);
                                const name = parts[1].trim();
                                productSales[name] = (productSales[name] || 0) + qty;
                            }
                        });
                    }
                });
            }
            current.setDate(current.getDate() + 1);
        }

        const lastUpdateDate = this.config.getLastInventoryUpdateDate();

        // Calculate sales since last inventory update for EACH product
        const salesSinceUpdate = {}; // name -> count
        if (lastUpdateDate) {
            let scanDate = new Date(lastUpdateDate);
            const today = new Date();
            while (scanDate <= today) {
                const dateStr = scanDate.toISOString().split('T')[0];
                const data = this.config.getDailyData(dateStr);
                if (data && data.ordersList) {
                    data.ordersList.forEach(order => {
                        if (order.products_summary) {
                            const items = order.products_summary.split(', ');
                            items.forEach(item => {
                                const parts = item.split('× ');
                                if (parts.length === 2) {
                                    const qty = parseInt(parts[0]);
                                    const name = parts[1].trim();
                                    salesSinceUpdate[name] = (salesSinceUpdate[name] || 0) + qty;
                                }
                            });
                        }
                    });
                }
                scanDate.setDate(scanDate.getDate() + 1);
            }
        }

        const inventoryData = [];
        Object.keys(productSales).forEach(name => {
            const cost = this.config.getProductCost(name);
            if (cost === null || parseFloat(cost) === 0) return; // Skip if no cost or 0 cost

            const stock = this.config.getProductStock(name);
            const sold = productSales[name];
            const velocity = sold / diffDays;

            const soldSince = salesSinceUpdate[name] || 0;
            const expectedStock = stock !== null ? stock - soldSince : null;

            // Calculate days left using expected stock
            let daysLeft = Infinity;
            if (expectedStock !== null) {
                daysLeft = velocity > 0 ? expectedStock / velocity : Infinity;
            }

            inventoryData.push({
                title: name,
                stock: stock,
                expectedStock: expectedStock,
                sold: sold,
                cost: parseFloat(cost),
                importance: sold * parseFloat(cost),
                daysLeft: daysLeft
            });
        });

        // Sort by importance descending (sold * cost)
        inventoryData.sort((a, b) => b.importance - a.importance);

        this.renderInventoryForecast(inventoryData);
    }

    renderInventoryForecast(products) {
        const lastUpdate = this.config.getLastInventoryUpdateDate() || 'Unknown';
        const header = document.createElement('div');
        header.style.marginBottom = '15px';
        header.style.padding = '10px';
        header.style.background = '#e2f3f5';
        header.style.borderRadius = '4px';
        header.style.borderLeft = '5px solid #17a2b8';
        header.innerHTML = `<strong>Last Inventory Update:</strong> ${lastUpdate} <span style="font-size: 0.8em; color: #666; margin-left: 10px;">(Expected stock is calculated based on sales since this date)</span>`;

        const table = document.createElement('table');
        table.style.width = '100%';
        table.style.borderCollapse = 'collapse';
        table.style.boxShadow = '0 0 20px rgba(0,0,0,0.1)';

        table.innerHTML = `
            <thead>
                <tr style="background-color: #17a2b8; color: #ffffff; text-align: left;">
                    <th style="padding: 12px 15px;">Product Title</th>
                    <th style="padding: 12px 15px;">Last Stock</th>
                    <th style="padding: 12px 15px;">Expected Stock</th>
                    <th style="padding: 12px 15px;">Sold (Selected Range)</th>
                    <th style="padding: 12px 15px;">Importance (Sold*Cost)</th>
                    <th style="padding: 12px 15px;">Forecasted Days</th>
                </tr>
            </thead>
            <tbody></tbody>
        `;

        const tbody = table.querySelector('tbody');
        products.forEach(p => {
            const tr = document.createElement('tr');
            tr.style.borderBottom = '1px solid #ddd';

            let stockHtml = p.stock === null ? '?' : p.stock;
            let expectedHtml = p.expectedStock === null ? '?' : Math.floor(p.expectedStock);
            let daysHtml = p.daysLeft === Infinity ? '∞' : Math.ceil(p.daysLeft);
            if (p.expectedStock === null) daysHtml = '?';

            let bgColor = '';
            let textColor = '';

            if (p.expectedStock === null) {
                bgColor = '#f2f2f2'; // Gray
                textColor = '#888';
            } else if (p.daysLeft < 30 || p.expectedStock <= 0) {
                bgColor = '#ffcccc';
                textColor = '#900';
            } else if (p.daysLeft < 60) {
                bgColor = '#fff3cd';
                textColor = '#856404';
            }

            if (bgColor) {
                tr.style.backgroundColor = bgColor;
                tr.style.color = textColor;
            }

            tr.innerHTML = `
                <td style="padding: 12px 15px;">${p.title}</td>
                <td style="padding: 12px 15px;">${stockHtml}</td>
                <td style="padding: 12px 15px; font-weight: bold;">${expectedHtml}</td>
                <td style="padding: 12px 15px;">${p.sold}</td>
                <td style="padding: 12px 15px;">${p.importance.toFixed(2)}</td>
                <td style="padding: 12px 15px; font-weight: bold;">${daysHtml}</td>
            `;
            tbody.appendChild(tr);
        });

        this.output.innerHTML = '';
        this.output.appendChild(header);
        this.output.appendChild(table);
    }

    parseCSVLine(text) {
        const re_valid = /^\s*(?:'[^'\\]*(?:\\[\S\s][^'\\]*)*'|"[^"\\]*(?:\\[\S\s][^"\\]*)*"|[^,'"\s\\]*(?:\s+[^,'"\s\\]+)*)\s*(?:,\s*(?:'[^'\\]*(?:\\[\S\s][^'\\]*)*'|"[^"\\]*(?:\\[\S\s][^"\\]*)*"|[^,'"\s\\]*(?:\s+[^,'"\s\\]+)*)\s*)*$/;
        const re_value = /(?!\s*$)\s*(?:'([^'\\]*(?:\\[\S\s][^'\\]*)*)'|"([^"\\]*(?:\\[\S\s][^"\\]*)*)"|([^,'"\s\\]*(?:\s+[^,'"\s\\]+)*))\s*(?:,|$)/g;

        if (!re_valid.test(text)) return null;

        const a = [];
        text.replace(re_value, function (m0, m1, m2, m3) {
            if (m1 !== undefined) a.push(m1.replace(/\\'/g, "'"));
            else if (m2 !== undefined) a.push(m2.replace(/\\"/g, '"'));
            else if (m3 !== undefined) a.push(m3);
            return '';
        });
        if (/,\s*$/.test(text)) a.push('');
        return a;
    }

    promptForMissingCosts(missingList, dailyStats, isImport = false) {
        this.output.innerHTML = '';

        const warning = document.createElement('div');
        warning.innerHTML = `<h3>Missing Product Costs</h3><p>Please enter costs for the following products to proceed:</p>`;
        warning.style.color = '#d9534f';
        this.output.appendChild(warning);

        const form = document.createElement('div');

        missingList.forEach(name => {
            const div = document.createElement('div');
            div.style.marginBottom = '10px';

            const label = document.createElement('label');
            label.textContent = name + ': ';
            label.style.fontWeight = 'bold';

            const input = document.createElement('input');
            input.type = 'number';
            input.step = '0.01';
            input.placeholder = 'Cost';
            input.dataset.product = name;

            div.appendChild(label);
            div.appendChild(input);

            // Check for similar products
            const similarList = this.config.findSimilarProducts(name);
            if (similarList.length > 0) {
                const suggestionsDiv = document.createElement('div');
                suggestionsDiv.style.marginLeft = '10px';
                suggestionsDiv.style.fontSize = '0.85em';
                suggestionsDiv.style.color = '#555';
                suggestionsDiv.style.display = 'inline-block';

                const spanLabel = document.createElement('span');
                spanLabel.textContent = 'Suggestions: ';
                suggestionsDiv.appendChild(spanLabel);

                similarList.forEach((item, index) => {
                    const suggestion = document.createElement('span');
                    suggestion.style.color = '#28a745';
                    suggestion.style.textDecoration = 'underline';
                    suggestion.style.cursor = 'pointer';
                    suggestion.style.marginRight = '8px';
                    suggestion.title = 'Click to use this cost';
                    suggestion.textContent = `"${item.name}" (${item.cost})`;

                    suggestion.onclick = () => {
                        input.value = item.cost;
                    };

                    suggestionsDiv.appendChild(suggestion);
                    if (index < similarList.length - 1) {
                        const sep = document.createTextNode(', ');
                        suggestionsDiv.appendChild(sep);
                    }
                });
                div.appendChild(suggestionsDiv);
            }

            form.appendChild(div);
        });

        const saveBtn = document.createElement('button');
        saveBtn.textContent = 'Save Costs & Continue Import';
        saveBtn.style.marginTop = '10px';
        saveBtn.style.padding = '10px 20px';
        saveBtn.style.background = '#0275d8';
        saveBtn.style.color = 'white';
        saveBtn.style.border = 'none';
        saveBtn.style.borderRadius = '5px';
        saveBtn.style.cursor = 'pointer';

        saveBtn.onclick = () => {
            const inputs = form.querySelectorAll('input');
            let allSet = true;
            inputs.forEach(input => {
                if (!input.value) allSet = false;
                else {
                    this.config.setProductCost(input.dataset.product, input.value);
                }
            });

            if (allSet) {
                // If costs are set, we need to recalculate product costs for the current batch
                // The easiest way is to re-run the processCSV (or just re-calc in memory, but re-run is safer)
                // However, we passed dailyStats which has 0 cost.
                // Re-running processCSV on lastCSVText is best.
                if (this.lastCSVText) {
                    this.processCSV(this.lastCSVText);
                }
                this.output.innerHTML = '';
            } else {
                alert('Please fill in all costs.');
            }
        };

        this.output.appendChild(form);
        this.output.appendChild(saveBtn);
    }

    generateReportFromDB(startStr, endStr) {
        if (!startStr || !endStr) {
            alert('Please select both start and end dates.');
            return;
        }

        const startDate = new Date(startStr);
        const endDate = new Date(endStr);
        if (startDate > endDate) {
            alert('Start date must be before end date.');
            return;
        }

        const dailyStats = {};
        let current = new Date(startDate);

        while (current <= endDate) {
            const dateStr = current.toISOString().split('T')[0];
            const data = this.config.getDailyData(dateStr);

            if (data) {
                dailyStats[dateStr] = data;
            } else {
                dailyStats[dateStr] = null; // Mark as missing
            }
            current.setDate(current.getDate() + 1);
        }

        this.generateReport(dailyStats, true); // True flag for "show missing"
    }

    generateReport(dailyStats, showMissing = false) {
        this.output.innerHTML = '';

        const table = document.createElement('table');
        table.style.width = '100%';
        table.style.borderCollapse = 'collapse';
        table.style.marginTop = '20px';
        table.style.boxShadow = '0 0 20px rgba(0,0,0,0.1)';

        const thead = document.createElement('thead');
        thead.innerHTML = `
            <tr style="background-color: #009879; color: #ffffff; text-align: left;">
                <th style="padding: 12px 15px;"></th>
                <th style="padding: 12px 15px;">Date</th>
                <th style="padding: 12px 15px;">Orders</th>
                <th style="padding: 12px 15px;">Przychód</th>
                <th style="padding: 12px 15px;">Prod Costs</th>
                <th style="padding: 12px 15px;">Fees</th>
                <th style="padding: 12px 15px;">Tax</th>
                <th style="padding: 12px 15px;">Ads</th>
                <th style="padding: 12px 15px;">Fixed</th>
                <th style="padding: 12px 15px;">Total Cost</th>
                <th style="padding: 12px 15px;">Profit</th>
            </tr>
        `;
        table.appendChild(thead);

        const tbody = document.createElement('tbody');
        const sortedDates = Object.keys(dailyStats).sort().reverse();
        const globals = this.config.getGlobals();

        sortedDates.forEach(date => {
            const day = dailyStats[date];

            if (day === null) {
                // Missing Data Row
                const tr = document.createElement('tr');
                tr.style.backgroundColor = '#fff3cd';
                tr.innerHTML = `
                    <td style="padding: 12px 15px;">⚠️</td>
                    <td style="padding: 12px 15px;">${date}</td>
                    <td colspan="9" style="padding: 12px 15px; color: #856404; font-style: italic;">Missing Data</td>
                `;
                tbody.appendChild(tr);
                return;
            }

            // Sort orders descending by ID
            const ordersReversed = [...day.ordersList].sort((a, b) => {
                const idA = parseInt(a.id) || 0;
                const idB = parseInt(b.id) || 0;
                return idB - idA;
            });

            const ordersCount = day.count;
            const nonAllegroCount = day.ordersList.filter(o => !o.is_allegro).length;

            const totalFees = day.fees;
            const totalTax = day.sales * (globals.revenue_tax_percent / 100);
            const totalAds = this.config.getAdsCostForDate(date);
            const totalFixed = globals.fixed_cost_per_day;

            const totalCost = day.product_costs + totalFees + totalTax + totalAds + totalFixed;
            const profit = day.sales - totalCost;

            // Main Row
            const tr = document.createElement('tr');
            tr.style.borderBottom = '1px solid #dddddd';
            tr.innerHTML = `
                <td style="padding: 12px 15px; cursor: pointer; text-align: center;">▶</td>
                <td style="padding: 12px 15px;">${date}</td>
                <td style="padding: 12px 15px;">${ordersCount}</td>
                <td style="padding: 12px 15px;">${day.income.toFixed(2)}</td>
                <td style="padding: 12px 15px;">${day.product_costs.toFixed(2)}</td>
                <td style="padding: 12px 15px;">${totalFees.toFixed(2)}</td>
                <td style="padding: 12px 15px;">${totalTax.toFixed(2)}</td>
                <td style="padding: 12px 15px; cursor: pointer; text-decoration: underline;" title="Click to edit Ads cost starting from this date">${totalAds.toFixed(2)}</td>
                <td style="padding: 12px 15px;">${totalFixed.toFixed(2)}</td>
                <td style="padding: 12px 15px; color: #d9534f;">${totalCost.toFixed(2)}</td>
                <td style="padding: 12px 15px; font-weight: bold; color: ${profit >= 0 ? '#28a745' : '#dc3545'}">${profit.toFixed(2)}</td>
            `;

            tr.cells[7].onclick = (e) => {
                e.stopPropagation();
                const newCost = prompt(`Set Ads cost starting from ${date}:`, totalAds);
                if (newCost !== null && !isNaN(parseFloat(newCost))) {
                    this.config.setAdsCostForDate(date, newCost);
                    // Recalculate is now "Refresh Report from DB"
                    // If we are in range mode, we need to refresh with same range
                    // We can just trigger the generate button click or call the function if we had access to inputs.
                    // For now, let's just alert user to refresh.
                    alert('Ads cost updated. Please click "Generate Report" to refresh.');
                }
            };
            tbody.appendChild(tr);

            // Details Row
            const detailsTr = document.createElement('tr');
            detailsTr.style.display = 'none';
            detailsTr.style.backgroundColor = '#f9f9f9';

            const detailsTd = document.createElement('td');
            detailsTd.colSpan = 11;
            detailsTd.style.padding = '10px 20px';

            const adsPerOrder = nonAllegroCount > 0 ? totalAds / nonAllegroCount : 0;
            const fixedPerOrder = ordersCount > 0 ? totalFixed / ordersCount : 0;

            let detailsHtml = `
                <table style="width: 100%; font-size: 0.9em; border: 1px solid #eee;">
                    <thead>
                        <tr style="background: #eef; color: #555;">
                            <th style="padding: 8px;">Order ID</th>
                            <th style="padding: 8px;">Products</th>
                            <th style="padding: 8px;">Sale</th>
                            <th style="padding: 8px;">Revenue</th>
                            <th style="padding: 8px;">Items Cost</th>
                            <th style="padding: 8px;">Fee</th>
                            <th style="padding: 8px;">Tax</th>
                            <th style="padding: 8px;">Ads</th>
                            <th style="padding: 8px;">Fixed</th>
                            <th style="padding: 8px;">Profit</th>
                        </tr>
                    </thead>
                    <tbody>
            `;

            ordersReversed.forEach(order => {
                const orderFee = order.fees;
                const orderTax = order.sales * (globals.revenue_tax_percent / 100);
                const orderAds = order.is_allegro ? 0 : adsPerOrder;

                const orderTotalCost = order.product_costs + orderFee + orderTax + orderAds + fixedPerOrder;
                const orderProfit = order.sales - orderTotalCost;

                const feeStyle = order.is_allegro ? 'color: purple; font-weight: bold;' : '';
                const feeTitle = order.is_allegro ? 'Allegro Fee' : 'Payment Fee';

                detailsHtml += `
                    <tr>
                        <td style="padding: 8px;">${order.id}</td>
                        <td style="padding: 8px; max-width: 300px; font-size: 0.85em;">${order.products_summary}</td>
                        <td style="padding: 8px;">${order.sales.toFixed(2)}</td>
                        <td style="padding: 8px;">${order.income.toFixed(2)}</td>
                        <td style="padding: 8px;">${order.product_costs.toFixed(2)}</td>
                        <td style="padding: 8px; ${feeStyle}" title="${feeTitle}">${orderFee.toFixed(2)}</td>
                        <td style="padding: 8px;">${orderTax.toFixed(2)}</td>
                        <td style="padding: 8px; color: #888;">${orderAds.toFixed(2)}</td>
                        <td style="padding: 8px; color: #888;">${fixedPerOrder.toFixed(2)}</td>
                        <td style="padding: 8px; font-weight: bold; color: ${orderProfit >= 0 ? 'green' : 'red'}">${orderProfit.toFixed(2)}</td>
                    </tr>
                `;
            });

            detailsHtml += `</tbody></table>`;
            detailsTd.innerHTML = detailsHtml;
            detailsTr.appendChild(detailsTd);
            tbody.appendChild(detailsTr);

            tr.cells[0].onclick = () => {
                const isHidden = detailsTr.style.display === 'none';
                detailsTr.style.display = isHidden ? 'table-row' : 'none';
                tr.cells[0].textContent = isHidden ? '▼' : '▶';
            };
        });

        // Calculate Totals and Averages
        let totalStats = {
            orders: 0, income: 0, prodCosts: 0, fees: 0, tax: 0, ads: 0, fixed: 0, totalCost: 0, profit: 0
        };
        const validDates = sortedDates.filter(d => dailyStats[d] !== null);
        const numDays = validDates.length;

        validDates.forEach(date => {
            const day = dailyStats[date];
            const ads = this.config.getAdsCostForDate(date);
            const fixed = globals.fixed_cost_per_day;
            const fees = day.fees;
            const tax = day.sales * (globals.revenue_tax_percent / 100);
            const totalC = day.product_costs + fees + tax + ads + fixed;
            const prof = day.sales - totalC;

            totalStats.orders += day.count;
            totalStats.income += day.income;
            totalStats.prodCosts += day.product_costs;
            totalStats.fees += fees;
            totalStats.tax += tax;
            totalStats.ads += ads;
            totalStats.fixed += fixed;
            totalStats.totalCost += totalC;
            totalStats.profit += prof;
        });

        // Append Average Row (Last - 1)
        if (numDays > 0) {
            // ... (Average and Projection logic matches existing, just using valid days)
            const avgRow = document.createElement('tr');
            avgRow.style.backgroundColor = '#f0f0f0';
            avgRow.style.fontWeight = 'bold';
            avgRow.style.borderTop = '2px solid #aaa';

            const avg = {
                orders: totalStats.orders / numDays,
                income: totalStats.income / numDays,
                prodCosts: totalStats.prodCosts / numDays,
                fees: totalStats.fees / numDays,
                tax: totalStats.tax / numDays,
                ads: totalStats.ads / numDays,
                fixed: totalStats.fixed / numDays,
                totalCost: totalStats.totalCost / numDays,
                profit: totalStats.profit / numDays
            };

            avgRow.innerHTML = `
                <td style="padding: 12px 15px;">AVG</td>
                <td style="padding: 12px 15px;">(Last ${numDays} days)</td>
                <td style="padding: 12px 15px;">${avg.orders.toFixed(1)}</td>
                <td style="padding: 12px 15px;">${avg.income.toFixed(2)}</td>
                <td style="padding: 12px 15px;">${avg.prodCosts.toFixed(2)}</td>
                <td style="padding: 12px 15px;">${avg.fees.toFixed(2)}</td>
                <td style="padding: 12px 15px;">${avg.tax.toFixed(2)}</td>
                <td style="padding: 12px 15px;">${avg.ads.toFixed(2)}</td>
                <td style="padding: 12px 15px;">${avg.fixed.toFixed(2)}</td>
                <td style="padding: 12px 15px; color: #d9534f;">${avg.totalCost.toFixed(2)}</td>
                <td style="padding: 12px 15px; color: ${avg.profit >= 0 ? '#28a745' : '#dc3545'}">${avg.profit.toFixed(2)}</td>
            `;
            tbody.appendChild(avgRow);

            // Append Projected Row (Last)
            const projRow = document.createElement('tr');
            projRow.style.backgroundColor = '#e8f4fd'; // Light blueish
            projRow.style.fontWeight = 'bold';
            projRow.style.borderBottom = '1px solid #aaa';

            const proj = {
                orders: avg.orders * 30,
                income: avg.income * 30,
                prodCosts: avg.prodCosts * 30,
                fees: avg.fees * 30,
                tax: avg.tax * 30,
                ads: avg.ads * 30,
                fixed: avg.fixed * 30,
                totalCost: avg.totalCost * 30,
                profit: avg.profit * 30
            };

            projRow.innerHTML = `
                <td style="padding: 12px 15px;">PROJ</td>
                <td style="padding: 12px 15px;">Next 30 Days</td>
                <td style="padding: 12px 15px;">${proj.orders.toFixed(0)}</td>
                <td style="padding: 12px 15px;">${proj.income.toFixed(2)}</td>
                <td style="padding: 12px 15px;">${proj.prodCosts.toFixed(2)}</td>
                <td style="padding: 12px 15px;">${proj.fees.toFixed(2)}</td>
                <td style="padding: 12px 15px;">${proj.tax.toFixed(2)}</td>
                <td style="padding: 12px 15px;">${proj.ads.toFixed(2)}</td>
                <td style="padding: 12px 15px;">${proj.fixed.toFixed(2)}</td>
                <td style="padding: 12px 15px; color: #d9534f;">${proj.totalCost.toFixed(2)}</td>
                <td style="padding: 12px 15px; color: ${proj.profit >= 0 ? '#28a745' : '#dc3545'}">${proj.profit.toFixed(2)}</td>
            `;
            tbody.appendChild(projRow);
        }

        table.appendChild(tbody);
        this.output.appendChild(table);
    }
}

new Profit();
