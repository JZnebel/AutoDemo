# Scout Guide

**Target duration:** ~66s | **Scenes:** 5 | **Audience:** customers

**Story arc:** This demo focuses on POS Core and Customer. Starting with Making a Sale and Product Search and Scanning, we walk through 5 key features, ending with Customer Lookup.

## Instructions

Walk through each scene below in order. For each scene:
1. Navigate to the relevant page/section
2. Perform the listed actions (click, fill, navigate)
3. Take a screenshot after each significant visual change
4. Move to the next scene

The walkthrough hook will automatically log all your Chrome DevTools actions to `walkthrough.jsonl`.

---

## Scene 1: Making a Sale
> **Group:** POS Core | **~10s** | **Goal:** Complete end-to-end walkthrough of processing a sale in Brother POS

**Actions:**
- Do: A success screen appears showing the total and, for cash payments, the change due.
- Click: Tap the card -- the weight selection modal opens.
- Click: Tap 3.5g -- the item appears in the cart at the tier price (e.g., $35.00).
- Click: Customer pays cash -- tap CASH, tap the $50 quick button, see change of $5.94.
- Click: Tap Complete Sale -- receipt prints, change amount shown on screen.

**Key points to demonstrate:**
- Complete end-to-end walkthrough of processing a sale in Brother POS
- This guide walks you through the complete process of ringing up a customer, from finding products to collecting payment and printing a receipt. Every sale in Brother POS follows the same core flow, regardless of the products involved.
- Make sure the following are in place before processing your first sale:

**Screenshot after:** POS cart with items

---

## Scene 2: Product Search and Scanning
> **Group:** POS Core | **~14s** | **Goal:** How to find products using search, category filters, brand filters, and barcode scanning

**Actions:**
- Type into: Search bar
- Do: Category tabs
- Do: Subcategory filter
- Do: Brand filter
- Do: Product grid

**Key points to demonstrate:**
- How to find products using search, category filters, brand filters, and barcode scanning
- Brother POS gives you multiple ways to find products quickly. Whether you are typing a name, browsing categories, or scanning barcodes, the goal is the same: get the right product into the cart as fast as possible.
- The left side of the POS screen is the **Product Pane**. From top to bottom, it contains:

**Screenshot after:** Product search with filtered results; Category filter with Flower category selected

---

## Scene 3: Weight-Based Products
> **Group:** POS Core | **~14s** | **Goal:** Weight presets, custom weight entry, USB scale integration, and tier pricing for cannabis and deli products

**Actions:**
- Click: Tap the weight-based product in the product grid.
- Click: Tap a preset to add the product at that weight and price to the cart.
- Do: Price per gram
- Type into: A weight input field where you can type any weight in grams.
- Type into: A live price calculation that updates as you type (e.g., "4.2g = $35.70").

**Key points to demonstrate:**
- Weight presets, custom weight entry, USB scale integration, and tier pricing for cannabis and deli products
- Many cannabis and deli products are sold by weight rather than by unit. Brother POS handles weight-based products through a dedicated weight selection modal that appears when you tap one of these products in the product grid.
- When you tap a weight-based product, instead of adding it to the cart immediately, a **Weight Selection Modal** opens. This modal presents the available weight options and pricing, letting you select the exact amount the customer wants.

**Screenshot after:** Weight selection modal with preset buttons

---

## Scene 4: Applying Discounts
> **Group:** POS Core | **~14s** | **Goal:** Percentage discounts, dollar discounts, final price overrides, and manager authorization

**Actions:**
- Do: Make sure there is at least one item in the cart.
- Click: Tap the Discount button in the action buttons area below the cart.
- Type into: A manager or admin must enter their 4-digit PIN.
- Click: Select the scope (Entire Order or Single Item).
- Type into: Choose the discount type (Percentage, Dollar, or Final Price).

**Key points to demonstrate:**
- Percentage discounts, dollar discounts, final price overrides, and manager authorization
- Brother POS supports several types of discounts that can be applied to individual items or to the entire order. This guide covers manual discounts applied at the register. For automatic promotions, see [Sale Campaigns and Freebies](./sale-campaigns-and-freebies).
- 1. Make sure there is at least one item in the cart. 2. Tap the **Discount** button in the action buttons area below the cart. 3. The discount modal opens.

**Screenshot after:** Discount modal with percentage, dollar, and final price options

---

## Scene 5: Customer Lookup
> **Group:** Customer | **~14s** | **Goal:** How to find existing customers at the POS register by name, phone number, email, customer code, or loyalty card.

**Actions:**
- Click: Tap the Customer button
- Scan: Scan a customer barcode
- Do: Swipe a loyalty card
- Do: Find the customer
- Click: Tap the customer's name

**Key points to demonstrate:**
- How to find existing customers at the POS register by name, phone number, email, customer code, or loyalty card.
- Before you can attach a customer to a sale -- for loyalty points, store credits, purchase history, or compliance tracking -- you need to find them in the system. Brother POS provides several ways to look up customers directly from the POS register without leaving the sales screen.
- Attaching a customer to a sale unlocks several features:

**Screenshot after:** Product Search

---
