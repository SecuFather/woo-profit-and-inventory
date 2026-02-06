# Profit & Inventory Calculator

A client-side web application designed for WooCommerce sellers to gain clear insights into their daily performance and inventory health.

## Core Features

### Daily Profit Reporting
Automatically calculates net profit by processing WooCommerce order CSVs. It accounts for:
- Product COGS (Cost of Goods Sold).
- Variable Ad Spend and Fixed Operating Costs.
- Payment & Marketplace Fees (including Allegro attribution).
- Revenue Taxes and Shipping.

### Smart Inventory Forecasting
Provides a data-driven replenishment guide by analyzing sales velocity:
- **Importance Sorting**: Prioritizes products by their total cost value (Sold * Cost).
- **Days Left Prediction**: Predicts exactly when stock will run out based on adjustable sales periods.
- **Color-Coded Alerts**: Visual warnings for low-stock items (<30/60 days).
