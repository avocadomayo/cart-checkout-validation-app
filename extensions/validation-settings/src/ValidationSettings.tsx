import React, { useState } from "react";
import {
  reactExtension,
  useApi,
  Text,
  Box,
  FunctionSettings,
  Section,
  NumberField,
  BlockStack,
  Banner,
  InlineStack,
  Image,
  type FunctionSettingsError,
} from "@shopify/ui-extensions-react/admin";
import { type ValidationSettingsApi } from "@shopify/ui-extensions/admin";

const TARGET = "admin.settings.validation.render";

export default reactExtension(
  TARGET,
  async (api: ValidationSettingsApi<typeof TARGET>) => {
    const existingDefinition = await getMetafieldDefinition(api.query);
    if (!existingDefinition) {
      const metafieldDefinition = await createMetafieldDefinition(api.query);

      if (!metafieldDefinition) {
        throw new Error("Failed to create metafield definition");
      }
    }

    const configuration = JSON.parse(
      api.data.validation?.metafields?.[0]?.value ?? "{}",
    );

    const products = await getProducts(api.query);

    return (
      <ValidationSettings configuration={configuration} products={products} />
    );
  },
);

function ValidationSettings({
  configuration,
  products,
}: {
  configuration: Object;
  products: Product[];
}) {
  const [errors, setErrors] = useState<string[]>([]);

  // Read existing product variant limits from metafield
  const [settings, setSettings] = useState<Record<string, number>>(
    createSettings(products, configuration),
  );

  const { applyMetafieldChange } = useApi(TARGET);

  const onError = (errors: FunctionSettingsError[]) => {
    setErrors(errors.map((e) => e.message));
  };

  const onChange = async (variant: ProductVariant, value: number) => {
    setErrors([]);
    setSettings((prev) => ({ ...prev, [variant.id]: Number(value) }));
  };

  const onSave = async () => {
    // Write updated product variant limits to metafield
    const result = await applyMetafieldChange({
      type: "updateMetafield",
      namespace: "$app:product-limits",
      key: "product-limits-values",
      value: JSON.stringify(settings),
    });

    if (result.type === "error") {
      setErrors([result.message]);
    }
  };

  return (
    <FunctionSettings onSave={onSave} onError={onError}>
      <ErrorBanner errors={errors} />
      <BlockStack gap="large">
        <ProductQuantitySettings
          products={products}
          settings={settings}
          onChange={onChange}
        />
      </BlockStack>
    </FunctionSettings>
  );
}

function ProductQuantitySettings({
  products,
  settings,
  onChange,
}: {
  products: Product[];
  settings: Record<string, number>;
  onChange: (variant: ProductVariant, value: number) => Promise<void>;
}) {
  function Header() {
    return (
      <InlineStack>
        <Box minInlineSize="5%" />
        <Box minInlineSize="5%">
          <Text fontWeight="bold">Variant Name</Text>
        </Box>
        <Box minInlineSize="50%">
          <Text fontWeight="bold">Limit</Text>
        </Box>
      </InlineStack>
    );
  }

  return products.map(({ title, variants }) => (
    <Section heading={title} key={title}>
      <BlockStack paddingBlock="large">
        <Header />
        {variants.map((variant) => {
          const limit = settings[variant.id];
          return (
            <InlineStack columnGap="none" key={variant.id}>
              <Box minInlineSize="5%">
                {variant.imageUrl ? (
                  <Image alt={variant.title} src={variant.imageUrl} />
                ) : (
                  <Text>No image</Text>
                )}
              </Box>
              <Box minInlineSize="5%">
                <Text>{variant.title}</Text>
              </Box>
              <Box minInlineSize="50%">
                <NumberField
                  value={limit}
                  min={0}
                  max={99}
                  label="Set a limit"
                  defaultValue={String(limit)}
                  onChange={(value) => onChange(variant, value)}
                ></NumberField>
              </Box>
            </InlineStack>
          );
        })}
      </BlockStack>
    </Section>
  ));
}

function ErrorBanner({ errors }: { errors: string[] }) {
  if (errors.length === 0) return null;

  return (
    <Box paddingBlockEnd="large">
      {errors.map((error, i) => (
        <Banner key={i} title="Errors were encountered" tone="critical">
          {error}
        </Banner>
      ))}
    </Box>
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

  const results = await adminApiQuery<ProductQueryData>(query);

  return (
    results?.data?.products.nodes.map(({ title, variants }) => {
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

const METAFIELD_NAMESPACE = "$app:product-limits";
const METAFIELD_KEY = "product-limits-values";

async function getMetafieldDefinition(
  adminApiQuery: ValidationSettingsApi<typeof TARGET>["query"],
) {
  const query = `#graphql
    query GetMetafieldDefinition {
      metafieldDefinitions(first: 1, ownerType: VALIDATION, namespace: "${METAFIELD_NAMESPACE}", key: "${METAFIELD_KEY}") {
        nodes {
          id
        }
      }
    }
  `;

  type MetafieldDefinitionsQueryData = {
    metafieldDefinitions: {
      nodes: Array<{
        id: string;
      }>;
    };
  };

  const result = await adminApiQuery<MetafieldDefinitionsQueryData>(query);

  return result?.data?.metafieldDefinitions?.nodes[0];
}

async function createMetafieldDefinition(
  adminApiQuery: ValidationSettingsApi<typeof TARGET>["query"],
) {
  const definition = {
    access: {
      admin: "MERCHANT_READ_WRITE",
    },
    key: METAFIELD_KEY,
    name: "Validation Configuration",
    namespace: METAFIELD_NAMESPACE,
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
