import type {
  CampaignStatus,
  Customer,
  DemoData,
  Expense,
  ExpenseCategory,
  MarketingCampaign,
  PaymentMethod,
  Product,
  ProductCategory,
  Transaction,
  TransactionItem,
} from "./types.ts";

function daysAgo(days: number, anchor = new Date()): string {
  const date = new Date(anchor);
  date.setUTCHours(12, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString();
}

const customerNames = [
  "Ananya Kapoor", "Rohan Verma", "Meera Shah", "Ishaan Khanna", "Kavya Iyer",
  "Arjun Nair", "Priya Menon", "Vivaan Joshi", "Diya Desai", "Kabir Bhatia",
  "Sana Qureshi", "Aditya Rao", "Nisha Kulkarni", "Rahul Chawla", "Tara Mukherjee",
  "Dev Malhotra", "Aisha Sethi", "Neel Banerjee", "Mira Reddy", "Yash Patil",
  "Ira Saxena", "Kunal Das", "Pooja Pillai", "Reyansh Ghosh", "Simran Kaur",
  "Aarav Kulkarni", "Zoya Mirza", "Dhruv Sinha", "Ritika Bose", "Om Prakash",
  "Sneha Shetty", "Parth Trivedi", "Rhea Dutta", "Manav Bansal",
];

const localities = [
  "Indiranagar", "Koramangala", "Jayanagar", "Malleshwaram", "HSR Layout",
  "Whitefield", "Rajajinagar", "Basavanagudi", "BTM Layout", "Banashankari",
];

export const initialCustomers: Customer[] = customerNames.map((name, index) => ({
  id: `cus-${String(index + 1).padStart(3, "0")}`,
  name,
  phone: `+91 90000 ${String(10001 + index).slice(-5)}`,
  email: `${name.toLowerCase().replaceAll(" ", ".")}@example.com`,
  address: `${index + 12}, ${localities[index % localities.length]}, Bengaluru`,
  joinedAt: daysAgo(index >= 14 && index <= 21 ? 19 + (index % 10) : 120 + index * 3),
  notes: index % 7 === 0 ? "Prefers UPI payments" : "",
}));

const productDefinitions: {
  name: string;
  category: ProductCategory;
  unit: string;
  price: number;
  costPrice: number;
  stock: number;
  reorderLevel: number;
}[] = [
  { name: "Basmati Rice", category: "Groceries", unit: "5 kg bag", price: 620, costPrice: 490, stock: 28, reorderLevel: 8 },
  { name: "Toor Dal", category: "Groceries", unit: "1 kg pack", price: 168, costPrice: 132, stock: 42, reorderLevel: 12 },
  { name: "Atta Flour", category: "Groceries", unit: "5 kg bag", price: 285, costPrice: 224, stock: 5, reorderLevel: 10 },
  { name: "Sunflower Oil", category: "Groceries", unit: "1 L bottle", price: 148, costPrice: 119, stock: 31, reorderLevel: 10 },
  { name: "Tata Tea Gold", category: "Beverages", unit: "500 g pack", price: 315, costPrice: 258, stock: 22, reorderLevel: 8 },
  { name: "Filter Coffee", category: "Beverages", unit: "250 g pack", price: 185, costPrice: 142, stock: 16, reorderLevel: 6 },
  { name: "Mango Juice", category: "Beverages", unit: "1 L carton", price: 110, costPrice: 79, stock: 0, reorderLevel: 8 },
  { name: "Mineral Water", category: "Beverages", unit: "1 L bottle", price: 20, costPrice: 10, stock: 96, reorderLevel: 24 },
  { name: "Dishwash Liquid", category: "Household", unit: "500 ml bottle", price: 125, costPrice: 88, stock: 19, reorderLevel: 6 },
  { name: "Laundry Detergent", category: "Household", unit: "1 kg pack", price: 210, costPrice: 168, stock: 4, reorderLevel: 10 },
  { name: "Floor Cleaner", category: "Household", unit: "1 L bottle", price: 165, costPrice: 119, stock: 14, reorderLevel: 5 },
  { name: "Steel Scrubber Set", category: "Household", unit: "3 piece set", price: 55, costPrice: 31, stock: 37, reorderLevel: 12 },
  { name: "Herbal Shampoo", category: "Personal care", unit: "340 ml bottle", price: 249, costPrice: 187, stock: 11, reorderLevel: 5 },
  { name: "Neem Toothpaste", category: "Personal care", unit: "150 g tube", price: 96, costPrice: 67, stock: 26, reorderLevel: 8 },
  { name: "Bathing Soap", category: "Personal care", unit: "125 g bar", price: 42, costPrice: 27, stock: 63, reorderLevel: 18 },
  { name: "Coconut Hair Oil", category: "Personal care", unit: "200 ml bottle", price: 118, costPrice: 83, stock: 7, reorderLevel: 8 },
  { name: "Masala Peanuts", category: "Snacks", unit: "200 g pack", price: 75, costPrice: 43, stock: 33, reorderLevel: 10 },
  { name: "Banana Chips", category: "Snacks", unit: "150 g pack", price: 65, costPrice: 37, stock: 29, reorderLevel: 10 },
  { name: "Dark Chocolate", category: "Snacks", unit: "80 g bar", price: 110, costPrice: 76, stock: 3, reorderLevel: 8 },
  { name: "Marie Biscuits", category: "Snacks", unit: "250 g pack", price: 38, costPrice: 24, stock: 48, reorderLevel: 15 },
  { name: "A5 Notebook", category: "Stationery", unit: "single", price: 55, costPrice: 31, stock: 24, reorderLevel: 8 },
  { name: "Ballpoint Pens", category: "Stationery", unit: "5 pack", price: 48, costPrice: 26, stock: 2, reorderLevel: 8 },
  { name: "Packing Tape", category: "Stationery", unit: "single roll", price: 35, costPrice: 19, stock: 18, reorderLevel: 6 },
  { name: "AA Batteries", category: "Household", unit: "2 pack", price: 80, costPrice: 52, stock: 0, reorderLevel: 6 },
];

export const initialProducts: Product[] = productDefinitions.map((product, index) => ({
  ...product,
  id: `prd-${String(index + 1).padStart(3, "0")}`,
  sku: `SGS-${String(index + 1).padStart(4, "0")}`,
}));

function transactionItems(transactionIndex: number, isHighValue: boolean): TransactionItem[] {
  const itemCount = isHighValue ? 3 : 1 + (transactionIndex % 3);
  const premiumProductIds = [0, 4, 12];
  return Array.from({ length: itemCount }, (_, itemIndex) => {
    const productIndex = isHighValue
      ? premiumProductIds[itemIndex]
      : (transactionIndex * 7 + itemIndex * 5) % initialProducts.length;
    const product = initialProducts[productIndex];
    return {
      productId: product.id,
      productName: product.name,
      quantity: isHighValue ? 2 + ((transactionIndex + itemIndex) % 2) : 1 + ((transactionIndex + itemIndex) % 3),
      unitPrice: product.price,
      unitCost: product.costPrice,
    };
  });
}

function createTransaction(
  transactionIndex: number,
  customerIndex: number,
  ageInDays: number,
  anchor: Date,
): Transaction {
  const items = transactionItems(transactionIndex, customerIndex < 5);
  const subtotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const discount = transactionIndex % 5 === 0 ? Math.round(subtotal * 0.05) : 0;
  const paymentMethods: PaymentMethod[] = ["upi", "cash", "card"];

  return {
    id: `txn-${String(transactionIndex + 1).padStart(4, "0")}`,
    customerId: initialCustomers[customerIndex].id,
    date: daysAgo(ageInDays, anchor),
    items,
    subtotal,
    discount,
    totalAmount: subtotal - discount,
    paymentMethod: paymentMethods[transactionIndex % paymentMethods.length],
    status: transactionIndex % 17 === 0 ? "processing" : "completed",
  };
}

function createTransactions(anchor: Date): Transaction[] {
  const transactions: Transaction[] = [];
  let index = 0;

  for (let customerIndex = 0; customerIndex < 5; customerIndex += 1) {
    for (let purchase = 0; purchase < 9; purchase += 1) {
      transactions.push(createTransaction(index++, customerIndex, 4 + purchase * 4 + customerIndex, anchor));
    }
  }
  for (let customerIndex = 5; customerIndex < 14; customerIndex += 1) {
    for (let purchase = 0; purchase < 6; purchase += 1) {
      transactions.push(createTransaction(index++, customerIndex, 2 + purchase * 6 + (customerIndex % 4), anchor));
    }
  }
  for (let customerIndex = 14; customerIndex < 22; customerIndex += 1) {
    for (let purchase = 0; purchase < 2; purchase += 1) {
      transactions.push(createTransaction(index++, customerIndex, 3 + purchase * 14 + (customerIndex % 5), anchor));
    }
  }
  for (let customerIndex = 22; customerIndex < initialCustomers.length; customerIndex += 1) {
    transactions.push(createTransaction(index++, customerIndex, 52 + ((customerIndex * 7) % 38), anchor));
  }

  return transactions.sort((a, b) => b.date.localeCompare(a.date));
}

const expenseDefinitions: {
  description: string;
  category: ExpenseCategory;
  amount: number;
  vendor: string;
}[] = [
  { description: "Monthly shop rent", category: "Rent", amount: 28000, vendor: "Lakeview Properties" },
  { description: "Electricity bill", category: "Utilities", amount: 4380, vendor: "BESCOM" },
  { description: "Water and waste collection", category: "Utilities", amount: 1150, vendor: "BBMP Services" },
  { description: "Grocery restock delivery", category: "Supplies", amount: 6240, vendor: "South Market Wholesale" },
  { description: "Local delivery fuel", category: "Transport", amount: 1780, vendor: "IndianOil" },
  { description: "Storefront signboard repair", category: "Maintenance", amount: 2350, vendor: "City Sign Works" },
  { description: "Festival WhatsApp promotion", category: "Marketing", amount: 3200, vendor: "LocalReach Studio" },
  { description: "Cleaning and packaging supplies", category: "Supplies", amount: 1680, vendor: "Green Basket Supply" },
  { description: "Internet and phone bill", category: "Utilities", amount: 1299, vendor: "Airtel Business" },
  { description: "Refrigerator service visit", category: "Maintenance", amount: 2850, vendor: "CoolCare Services" },
  { description: "Weekly wholesale pickup", category: "Transport", amount: 960, vendor: "Metro Auto Service" },
  { description: "Paper bags and receipt rolls", category: "Supplies", amount: 2140, vendor: "PackRight Bengaluru" },
  { description: "Neighbourhood flyer printing", category: "Marketing", amount: 1450, vendor: "Corner Print House" },
  { description: "Electricity bill", category: "Utilities", amount: 3910, vendor: "BESCOM" },
  { description: "Monthly shop rent", category: "Rent", amount: 28000, vendor: "Lakeview Properties" },
  { description: "Bulk snacks restock delivery", category: "Supplies", amount: 3870, vendor: "South Market Wholesale" },
  { description: "Delivery fuel", category: "Transport", amount: 1320, vendor: "IndianOil" },
  { description: "Shop shutter maintenance", category: "Maintenance", amount: 1760, vendor: "Ravi Repairs" },
  { description: "Internet and phone bill", category: "Utilities", amount: 1299, vendor: "Airtel Business" },
  { description: "Local festival display materials", category: "Marketing", amount: 2480, vendor: "Bright Banner Co." },
  { description: "Monthly shop rent", category: "Rent", amount: 28000, vendor: "Lakeview Properties" },
  { description: "Household goods restock", category: "Supplies", amount: 5140, vendor: "South Market Wholesale" },
  { description: "Water and waste collection", category: "Utilities", amount: 1080, vendor: "BBMP Services" },
  { description: "Delivery fuel", category: "Transport", amount: 1540, vendor: "IndianOil" },
];

function createExpenses(anchor: Date): Expense[] {
  return expenseDefinitions.map((expense, index) => ({
    ...expense,
    id: `exp-${String(index + 1).padStart(3, "0")}`,
    date: daysAgo(Math.min(87, index * 3 + (index % 4)), anchor),
    notes: index % 6 === 0 ? "Paid by UPI" : "",
  }));
}

const campaignDefinitions: {
  name: string;
  channel: MarketingCampaign["channel"];
  status: CampaignStatus;
  daysAgo: number;
  budget: number;
  audienceSize: number;
  sentCount: number;
  conversions: number;
  revenue: number;
}[] = [
  { name: "Monsoon pantry essentials", channel: "WhatsApp", status: "completed", daysAgo: 72, budget: 2400, audienceSize: 186, sentCount: 186, conversions: 24, revenue: 18450 },
  { name: "Weekend snack bundle", channel: "In-store", status: "completed", daysAgo: 55, budget: 1200, audienceSize: 0, sentCount: 0, conversions: 37, revenue: 12980 },
  { name: "Festival shopping reminder", channel: "WhatsApp", status: "active", daysAgo: 12, budget: 3200, audienceSize: 214, sentCount: 214, conversions: 31, revenue: 22860 },
  { name: "Fresh arrivals on Instagram", channel: "Instagram", status: "scheduled", daysAgo: -3, budget: 1800, audienceSize: 340, sentCount: 0, conversions: 0, revenue: 0 },
  { name: "Thank-you offer for regulars", channel: "SMS", status: "draft", daysAgo: -1, budget: 950, audienceSize: 86, sentCount: 0, conversions: 0, revenue: 0 },
  { name: "Back-to-school stationery", channel: "WhatsApp", status: "completed", daysAgo: 83, budget: 1600, audienceSize: 142, sentCount: 142, conversions: 19, revenue: 9740 },
];

function createCampaigns(anchor: Date): MarketingCampaign[] {
  return campaignDefinitions.map((campaign, index) => ({
    ...campaign,
    id: `cmp-${String(index + 1).padStart(3, "0")}`,
    startDate: daysAgo(campaign.daysAgo, anchor),
    endDate: daysAgo(campaign.daysAgo - (index % 2 === 0 ? 5 : 3), anchor),
  }));
}

export function createDemoData(anchor = new Date()): DemoData {
  return {
    asOf: anchor.toISOString(),
    customers: initialCustomers,
    products: initialProducts,
    transactions: createTransactions(anchor),
    expenses: createExpenses(anchor),
    campaigns: createCampaigns(anchor),
  };
}

export const demoData = createDemoData();
