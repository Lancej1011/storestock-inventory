import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create admin user
  const passwordHash = await bcrypt.hash('password123', 12);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@store.com' },
    update: {},
    create: {
      email: 'admin@store.com',
      passwordHash,
      fullName: 'Admin User',
      role: 'ADMIN',
    },
  });
  console.log('Created admin user:', admin.email);

  // Create a store
  const store = await prisma.store.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Main Store',
      address: '123 Main Street',
      phone: '555-0100',
      email: 'store@example.com',
    },
  });
  console.log('Created store:', store.name);

  // Create categories
  const electronics = await prisma.category.upsert({
    where: { id: '00000000-0000-0000-0000-000000000010' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000010',
      name: 'Electronics',
      description: 'Electronic devices and accessories',
    },
  });

  const groceries = await prisma.category.upsert({
    where: { id: '00000000-0000-0000-0000-000000000011' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000011',
      name: 'Groceries',
      description: 'Food and beverage items',
    },
  });
  console.log('Created categories');

  // Create a supplier
  const supplier = await prisma.supplier.upsert({
    where: { id: '00000000-0000-0000-0000-000000000020' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000020',
      name: 'ABC Distributors',
      contactName: 'John Smith',
      email: 'john@abcdist.com',
      phone: '555-0200',
    },
  });
  console.log('Created supplier:', supplier.name);

  // Create products
  const products = [
    {
      id: '00000000-0000-0000-0000-000000000030',
      barcode: '1234567890123',
      sku: 'PHONE-001',
      name: 'Smartphone X',
      description: 'Latest smartphone model',
      categoryId: electronics.id,
      supplierId: supplier.id,
      costPrice: 450.00,
      retailPrice: 699.99,
      reorderLevel: 10,
    },
    {
      id: '00000000-0000-0000-0000-000000000031',
      barcode: '1234567890124',
      sku: 'LAPTOP-001',
      name: 'Laptop Pro 15',
      description: 'Professional laptop',
      categoryId: electronics.id,
      supplierId: supplier.id,
      costPrice: 800.00,
      retailPrice: 1299.99,
      reorderLevel: 5,
    },
    {
      id: '00000000-0000-0000-0000-000000000032',
      barcode: '5901234123457',
      sku: 'MILK-001',
      name: 'Organic Milk 1L',
      description: 'Fresh organic whole milk',
      categoryId: groceries.id,
      supplierId: supplier.id,
      costPrice: 2.50,
      retailPrice: 4.99,
      reorderLevel: 50,
    },
  ];

  for (const product of products) {
    await prisma.product.upsert({
      where: { id: product.id },
      update: {},
      create: product,
    });
  }
  console.log('Created products');

  // Create a location
  const location = await prisma.location.upsert({
    where: { id: '00000000-0000-0000-0000-000000000040' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000040',
      storeId: store.id,
      aisle: 'A',
      shelf: '1',
      bin: 'top',
      description: 'Main shelf',
    },
  });
  console.log('Created location');

  // Create inventory
  for (const product of products) {
    await prisma.inventory.upsert({
      where: {
        storeId_productId_locationId: {
          storeId: store.id,
          productId: product.id,
          locationId: location.id,
        },
      },
      update: {},
      create: {
        storeId: store.id,
        productId: product.id,
        locationId: location.id,
        quantity: 25,
      },
    });
  }
  console.log('Created inventory');

  console.log('Seeding complete!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
