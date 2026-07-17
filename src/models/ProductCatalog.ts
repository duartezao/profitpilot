import mongoose, { Schema } from "mongoose";

const CollectionRefSchema = new Schema(
  {
    id: { type: String, required: true },
    title: { type: String, trim: true, default: "" },
    handle: { type: String, trim: true, default: "" },
  },
  { _id: false },
);

/** Catálogo Shopify por produto — coleções para cruzar vendas com campanhas. */
const ProductCatalogSchema = new Schema(
  {
    storeId: {
      type: Schema.Types.ObjectId,
      ref: "Store",
      required: true,
      index: true,
    },
    productId: { type: String, required: true },
    title: { type: String, trim: true, default: "" },
    /** Handle Shopify do produto (`/products/{handle}`). */
    handle: { type: String, trim: true, default: null, index: true },
    collections: { type: [CollectionRefSchema], default: [] },
    primaryCollectionId: { type: String, default: null },
    primaryCollectionTitle: { type: String, default: null },
    primaryCollectionHandle: { type: String, default: null },
    collectionsSyncedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

ProductCatalogSchema.index({ storeId: 1, productId: 1 }, { unique: true });
ProductCatalogSchema.index({ storeId: 1, primaryCollectionId: 1 });
ProductCatalogSchema.index({ storeId: 1, handle: 1 });

export type ProductCatalogDoc = mongoose.InferSchemaType<
  typeof ProductCatalogSchema
> & {
  _id: mongoose.Types.ObjectId;
};

export const ProductCatalog =
  (mongoose.models.ProductCatalog as mongoose.Model<ProductCatalogDoc>) ||
  mongoose.model<ProductCatalogDoc>("ProductCatalog", ProductCatalogSchema);
