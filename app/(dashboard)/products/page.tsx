import { ProductsManager } from '@/components/products/ProductsManager';

export default function ProductsPage() {
  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Products</h1>
        <p className="text-sm text-gray-500 mt-1">
          Register products and upload GLB models. The product ID links a 3D model to concept runs.
        </p>
      </div>
      <ProductsManager />
    </div>
  );
}
