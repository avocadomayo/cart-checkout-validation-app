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
  // how come separate packages for Admin and Checkout components?
} from "@shopify/ui-extensions-react/admin";
import { useState } from "react";

// The target used here must match the target used in the extension's toml file (../shopify.extension.toml)
const TARGET = "admin.settings.validation.render";

export default reactExtension(TARGET, async (api) =>{ 
  const configuration = JSON.parse(api.data.validation?.metafields?.[0]?.value ?? "{}");
  const products = await getProducts();

  return <ValidationSettings configuration={configuration} products={products} />
});

function ValidationSettings({configuration, products}: {configuration: Object, products: any}) {
  const [errors, setErrors] = useState([]);

  // The useApi hook provides access to several useful APIs like i18n, data and saveMetafields.
  const { applyMetafieldChange } = useApi(TARGET);

  const settings = {};

  products.forEach(({variants}) => {
    variants.forEach(({id}) => {
      const limit = configuration[id] ?? 5;
      settings[id] = limit;
    })
  })

  const onError = (errors) => {
    setErrors(errors.map((e) => e.message))
  }

  const onChange = async (variant, value) => {
    setErrors([]);
    const newSettings = {
      ...settings,
      [variant.id]: value,
    };

    const result = await applyMetafieldChange({
      type: "updateMetafield",
      namespace: "$app:product-limits",
      key: "product-limits-values",
      value: JSON.stringify(newSettings),
    });

    if (result.type === "error") {
      setErrors([result.message])
    }
  }

  // this UI section could be refactored for 

  return (
    <FunctionSettings onError={onError}>
      <Box paddingBlockEnd="large">
        {errors.length ? errors.map((error, i) => (
          <Banner key={i} title="Errors were encountered" tone="critical" dismissible>
            <Box>{error}</Box>
          </Banner>
        )) : null}
        {"HEY"}
      </Box>
      <BlockStack gap="large">
        { // display each product and variant's settings
          products.map(({title, variants}) => (
          <Section heading={title} key={title}>
            <BlockStack paddingBlock="large">
              <InlineStack>
                <Box minInlineSize="10%" />
                <Box minInlineSize="5%"><Text fontWeight="bold">Variant Name</Text></Box>
                <Box minInlineSize="50%"><Text fontWeight="bold">Limit</Text></Box>
              </InlineStack>
              {
                variants.map((variant) => {
                  const limit = settings[variant.id];
                  return (
                    <InlineStack columnGap="none" key={variant.id}>
                      <Box minInlineSize="5%">{variant.imageUrl ? <Image alt={variant.title} src={variant.imageUrl} /> : <Text>No image</Text>}</Box>
                      <Box minInlineSize="5%"><Text>{variant.title}</Text></Box>
                      <Box minInlineSize="50%"><NumberField value={limit} min={0} max={99} label="Set a limit" defaultValue={String(limit)} onChange={(value) => onChange(variant, value)}></NumberField></Box>
                    </InlineStack>
                  );
                })}
            </BlockStack>
          </Section>
        ))}
      </BlockStack>
    </FunctionSettings>
  );
}

async function getProducts() {
  const query = `#graphql
  query FetchProducts {
    products(first: 5) {
      nodes {
        title
        variants(first: 5) {
          nodes {
            id
            title
            # maxHeight query is deprecated
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