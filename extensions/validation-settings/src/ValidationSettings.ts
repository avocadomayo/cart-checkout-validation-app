import { type RemoteRoot } from "@remote-ui/core";
import {
  extend,
  Text,
  Box,
  FunctionSettings,
  Section,
  NumberField,
  BlockStack,
  Banner,
  InlineStack,
  Image,
  type ValidationSettingsApi,
  type FunctionSettingsError,
} from "@shopify/ui-extensions/admin";

const TARGET = "admin.settings.validation.render";

export default extend(
  TARGET,
  async (root: RemoteRoot, api: ValidationSettingsApi<typeof TARGET>) => {
    const metafields = api.data.validation?.metafields;
    if (!metafields) {
      const metafieldDefinition = await createMetafieldDefinition(api.query);

      if (!metafieldDefinition) {
        throw new Error("Failed to create metafield definition");
      }
    }

    const configuration = JSON.parse(metafields?.[0]?.value ?? "{}");

    const products = await getProducts(api.query);

    renderValidationSettings(root, configuration, products, api);
  },
);

function renderValidationSettings(
  root: RemoteRoot,
  configuration: Object,
  products: Product[],
  api: ValidationSettingsApi<typeof TARGET>,
) {
  let errors: string[] = [];

  // Read existing product variant limits from metafield
  let settings = createSettings(products, configuration);

  const onError = (newErrors: FunctionSettingsError[]) => {
    errors = newErrors.map((e) => e.message);
    renderContent();
  };

  const onChange = async (variant: ProductVariant, value: number) => {
    errors = [];
    settings = {
      ...settings,
      [variant.id]: Number(value),
    };
  };

  const onSave = async () => {
    // Write updated product variant limits to metafield
    const results = await api.applyMetafieldChange({
      type: "updateMetafield",
      namespace: "$app:product-limits",
      key: "product-limits-values",
      value: JSON.stringify(settings),
    });

    if (results.type === "error") {
      errors = [results.message];
      renderContent();
    }
  };

  const renderErrors = (errors: string[], root: RemoteRoot) => {
    if (!errors.length) {
      return [];
    }

    return errors.map((error, i) =>
      root.createComponent(
        Banner,
        {
          title: "Errors were encountered",
          tone: "critical",
        },
        root.createComponent(Text, {}, error),
      ),
    );
  };

  const renderContent = () => {
    return root.append(
      root.createComponent(
        FunctionSettings,
        { onSave, onError },
        ...renderErrors(errors, root),
        root.createComponent(
          BlockStack,
          { gap: "large" },
          products.map((product) =>
            renderProductQuantitySettings(root, product, settings, onChange),
          ),
        ),
      ),
    );
  };

  renderContent();
}

function renderProductQuantitySettings(
  root: RemoteRoot,
  product: Product,
  settings: Record<string, number>,
  onChange: (variant: ProductVariant, value: number) => Promise<void>,
) {
  const heading = root.createComponent(
    InlineStack,
    {},
    root.createComponent(Box, { minInlineSize: "5%" }),
    root.createComponent(
      Box,
      { minInlineSize: "5%" },
      root.createComponent(Text, { fontWeight: "bold" }, "Variant Name"),
    ),
    root.createComponent(
      Box,
      { minInlineSize: "50%" },
      root.createComponent(Text, { fontWeight: "bold" }, "Limit"),
    ),
  );

  const renderVariant = (
    variant: ProductVariant,
    settings: Record<string, number>,
    root: RemoteRoot,
  ) => {
    const limit = settings[variant.id];

    return root.createComponent(
      InlineStack,
      { columnGap: "none" },
      root.createComponent(
        Box,
        { minInlineSize: "5%" },
        variant.imageUrl
          ? root.createComponent(Image, {
              source: variant.imageUrl,
              alt: variant.title,
            })
          : null,
      ),
      root.createComponent(
        Box,
        { minInlineSize: "5%" },
        root.createComponent(Text, {}, variant.title),
      ),
      root.createComponent(
        Box,
        { minInlineSize: "50%" },
        root.createComponent(NumberField, {
          label: "Set a limit",
          value: limit,
          min: 0,
          max: 99,
          defaultValue: String(limit),
          onChange: (value: number) => onChange(variant, value),
        }),
      ),
    );
  };

  return root.createComponent(
    Section,
    { heading: product.title },
    root.createComponent(
      BlockStack,
      { paddingBlock: "large" },
      heading,
      ...product.variants.map((variant) =>
        renderVariant(variant, settings, root),
      ),
    ),
  );
}

type Product = {
  title: string;
  variants: ProductVariant[];
};

type ProductVariant = {
  id: string;
  title: string;
  imageUrl?: string;
};

async function getProducts(
  adminApiQuery: ValidationSettingsApi<typeof TARGET>["query"],
): Promise<Product[]> {
  const query = `#graphql
  query FetchProducts {
    products(first: 5) {
      nodes {
        title
        variants(first: 5) {
          nodes {
            id
            title
            image {
              url
            }
          }
        }
      }
    }
  }`;

  type ProductQueryData = {
    products: {
      nodes: Array<{
        title: string;
        variants: {
          nodes: Array<{
            id: string;
            title: string;
            image?: {
              url: string;
            };
          }>;
        };
      }>;
    };
  };

  const result = await adminApiQuery<ProductQueryData>(query);

  return (
    result?.data?.products.nodes.map(({ title, variants }) => {
      return {
        title,
        variants: variants.nodes.map((variant) => ({
          title: variant.title,
          id: variant.id,
          imageUrl: variant?.image?.url,
        })),
      };
    }) ?? []
  );
}

async function createMetafieldDefinition(
  adminApiQuery: ValidationSettingsApi<typeof TARGET>["query"],
) {
  const definition = {
    access: {
      admin: "MERCHANT_READ_WRITE",
    },
    key: "product-limits-values",
    name: "Validation Configuration",
    namespace: "$app:product-limits",
    ownerType: "VALIDATION",
    type: "json",
  };

  const query = `#graphql
    mutation CreateMetafieldDefinition($definition: MetafieldDefinitionInput!) {
      metafieldDefinitionCreate(definition: $definition) {
        createdDefinition {
            id
          }
        }
      }
  `;

  type MetafieldDefinitionCreateData = {
    metafieldDefinitionCreate: {
      createdDefinition?: {
        id: string;
      };
    };
  };

  const variables = { definition };
  const result = await adminApiQuery<MetafieldDefinitionCreateData>(query, {
    variables,
  });

  return result?.data?.metafieldDefinitionCreate?.createdDefinition;
}

function createSettings(
  products: Product[],
  configuration: Object,
): Record<string, number> {
  const settings = {};

  products.forEach(({ variants }) => {
    variants.forEach(({ id }) => {
      const limit = configuration[id];

      if (limit) {
        settings[id] = limit;
      }
    });
  });

  return settings;
}
