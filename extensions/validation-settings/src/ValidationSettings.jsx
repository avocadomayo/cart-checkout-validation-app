import { useState } from "react";
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
} from "@shopify/ui-extensions-react/admin";

const TARGET = "admin.settings.validation.render";

export default reactExtension(TARGET, async (api) => {
  const configuration = JSON.parse(
    api.data.validation?.metafields?.[0]?.value ?? "{}",
  );

  if (!api.data.validation?.metafields) {
    const metafieldDefinition = await createMetafieldDefinition(api.query);

    if (!metafieldDefinition) {
      throw new Error("Failed to create metafield definition");
    }
  }

  const products = await getProducts(api.query);

  return (
    <ValidationSettings configuration={configuration} products={products} />
  );
});

function ValidationSettings({ configuration, products }) {
  const [errors, setErrors] = useState([]);

  // Read existing product variant limits from metafield
  const [settings, setSettings] = useState(
    createSettings(products, configuration),
  );

  const { applyMetafieldChange } = useApi(TARGET);

  const onError = (error) => {
    setErrors(errors.map((e) => e.message));
  };

  const onChange = async (variant, value) => {
    setErrors([]);
    setSettings((prev) => ({
      ...prev,
      [variant.id]: Number(value),
    }));
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

function ProductQuantitySettings({ products, settings, onChange }) {
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

function ErrorBanner({ errors }) {
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

async function getProducts(adminApiQuery) {
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

  const result = await adminApiQuery(query);

  return result?.data?.products.nodes.map(({ title, variants }) => {
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

async function createMetafieldDefinition(adminApiQuery) {
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

  const variables = { definition };
  const result = await adminApiQuery(query, { variables });

  return result?.data?.metafieldDefinitionCreate?.createdDefinition;
}

function createSettings(products, configuration) {
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
