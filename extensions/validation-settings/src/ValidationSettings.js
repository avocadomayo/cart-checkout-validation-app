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

export default extend(
  TARGET,
  async (root, api) => {
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
  root,
  configuration,
  products,
  api,
) {
  let errors = [];
    // Read existing product variant limits from metafield
    let settings = createSettings(products, configuration);


  const onError = (newErrors) => {
    errors = newErrors.map((e) => e.message);
    renderContent();
  };

  const onChange = async (variant, value) => {
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

  const renderErrors = (errors, root) => {
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
  root,
  product,
  settings,
  onChange,
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
    variant,
    settings,
    root,
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
          onChange: (value) => onChange(variant, value),
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

  async function adminApiRequest(query, variables = null) {
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
  products,
  configuration,
) {
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
