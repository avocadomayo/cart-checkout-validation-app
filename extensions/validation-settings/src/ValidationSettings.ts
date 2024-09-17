import { type RemoteRoot } from "@remote-ui/core";
import {
  extend,
  Section,
  NumberField,
  Box,
  InlineStack,
  Text,
  BlockStack,
  Banner,
  Image,
  FunctionSettings,
  type ValidationSettingsApi,
  type FunctionSettingsError,
} from "@shopify/ui-extensions/admin";

const TARGET = "admin.settings.validation.render";

export default extend(
  TARGET,
  async (root: RemoteRoot, api: ValidationSettingsApi<typeof TARGET>) => {
    const configuration = JSON.parse(
      api.data.validation?.metafields?.[0]?.value ?? "{}",
    );

    if (!api.data.validation?.metafields) {
      const metafieldDefinition = await createMetafieldDefinition();

      if (!metafieldDefinition) {
        throw new Error("Failed to create metafield definition");
      }
    }

    const products = await getProducts();

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
  const settings = createSettings(products, configuration);

  const onError = (newErrors: FunctionSettingsError[]) => {
    errors = newErrors.map((e) => e.message);
    renderContent();
  };

  const onChange = async (variant: ProductVariant, value: number) => {
    errors = [];

    const newSettings = {
      ...settings,
      [variant.id]: Number(value),
    };

    // Write updated product variant limits to metafield
    const results = await api.applyMetafieldChange({
      type: "updateMetafield",
      namespace: "$app:product-limits",
      key: "product-limits-values",
      value: JSON.stringify(newSettings),
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
          dismissible: true,
          tone: "critical",
        },
        root.createComponent(Box, {}, error),
      ),
    );
  };

  const renderContent = () => {
    return root.append(
      root.createComponent(
        FunctionSettings,
        { onError },
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

async function getProducts(): Promise<Product[]> {
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

  const results = await fetch("shopify:admin/api/graphql.json", {
    method: "POST",
    body: JSON.stringify({ query }),
  }).then((res) => res.json());

  return results?.data?.products?.nodes?.map(({ title, variants }) => {
    return {
      title,
      variants: variants.nodes.map((variant) => ({
        title: variant.title,
        id: variant.id,
        imageUrl: variant?.image?.url,
      })),
    };
  });
}

async function createMetafieldDefinition() {
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

  async function adminApiRequest(query: string, variables: any | null = null) {
    const results = await fetch("shopify:admin/api/graphql.json", {
      method: "POST",
      body: JSON.stringify({ query, variables }),
    }).then((res) => res.json());

    return results;
  }

  const variables = { definition };
  const results = await adminApiRequest(query, variables);

  return results?.data?.metafieldDefinitionCreate?.createdDefinition;
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
