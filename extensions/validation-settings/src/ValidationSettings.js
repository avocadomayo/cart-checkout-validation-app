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
} from "@shopify/ui-extensions/admin";

const TARGET = "admin.settings.validation.render";

export default extend(TARGET, async (root, api) => {
  const existingDefinition = await getMetafieldDefinition(api.query);
  if (!existingDefinition) {
    // Creates a metafield definition for persistence if no pre-existing definition exists
    const metafieldDefinition = await createMetafieldDefinition(api.query);

    if (!metafieldDefinition) {
      throw new Error("Failed to create metafield definition");
    }
  }

  // Read existing persisted data about product limits from the associated metafield
  const configuration = JSON.parse(
    api.data.validation?.metafields?.[0]?.value ?? "{}",
  );

  // Query product data needed to render the settings UI
  const products = await getProducts(api.query);

  renderValidationSettings(root, configuration, products, api);
});

function renderValidationSettings(root, configuration, products, api) {
  let errors = [];
  // State to keep track of product limit settings, initialized to any persisted metafield value
  let settings = createSettings(products, configuration);

  const onError = (newErrors) => {
    errors = newErrors.map((e) => e.message);
    renderContent();
  };

  const onChange = async (variant, value) => {
    errors = [];
    const newSettings = {
      ...settings,
      [variant.id]: Number(value),
    };
    settings = newSettings;

    // On input change, commit updated product variant limits to memory.
    // Caution: the changes are only persisted on save!
    const result = await api.applyMetafieldChange({
      type: "updateMetafield",
      namespace: "$app:product-limits",
      key: "product-limits-values",
      value: JSON.stringify(newSettings),
    });

    if (result.type === "error") {
      errors = [result.message];
      renderContent();
    }
  };

  const renderErrors = (errors, root) => {
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
        // Note: FunctionSettings must be rendered for the host to receive metafield updates
        FunctionSettings,
        { onError },
        ...renderErrors(errors, root),
        ...products.map((product) =>
          renderProductQuantitySettings(root, product, settings, onChange),
        ),
      ),
    );
  };

  renderContent();
}

function renderProductQuantitySettings(root, product, settings, onChange) {
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

  const renderVariant = (variant, settings, root) => {
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
          onChange: (value) => onChange(variant, value),
        }),
      ),
    );
  };

  // Render table of product variants and inputs to assign limits
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

const METAFIELD_NAMESPACE = "$app:product-limits";
const METAFIELD_KEY = "product-limits-values";

async function getMetafieldDefinition(adminApiQuery) {
  const query = `#graphql
    query GetMetafieldDefinition {
      metafieldDefinitions(first: 1, ownerType: VALIDATION, namespace: "${METAFIELD_NAMESPACE}", key: "${METAFIELD_KEY}") {
        nodes {
          id
        }
      }
    }
  `;

  const result = await adminApiQuery(query);

  return result?.data?.metafieldDefinitions?.nodes[0];
}

async function createMetafieldDefinition(adminApiQuery) {
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

  const variables = { definition };
  const result = await adminApiQuery(query, { variables });

  return result?.data?.metafieldDefinitionCreate?.createdDefinition;
}

function createSettings(products, configuration) {
  const settings = {};

  products.forEach(({ variants }) => {
    variants.forEach(({ id }) => {
      // Read existing product limits from metafield
      const limit = configuration[id];

      if (limit) {
        settings[id] = limit;
      }
    });
  });

  return settings;
}
