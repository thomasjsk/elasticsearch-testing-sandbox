const config = {
  url: "http://localhost:9200",
};

const api = {
  index: {
    create: ({ index, body }: { index: string; body: any }) =>
      cy
        .request({
          method: "PUT",
          url: `${config.url}/${index}`,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
          },
          body,
        })
        .then((res) => {
          // console.log("res", res);
        }),
    delete: ({ index }: { index: string }) =>
      cy
        .request("DELETE", `${config.url}/${index}`)
        .its("body")
        .then((res) => {
          // console.log("res", res);
        }),
  },
  document: {
    insert: ({ index, document }: { index: string; document: any }) =>
      cy
        .request({
          method: "POST",
          url: `${config.url}/${index}/_doc`,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
          },
          body: document,
        })
        .its("body")
        .then((res) => {
          // console.log("res", res);
        }),
    search: ({ index, query }: { index: string; query: any }) =>
      cy.request({
        method: "POST",
        url: `${config.url}/${index}/_search`,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
        },
        body: query,
      }),
  },
};

function toExpected(phrases: string[]) {
  return phrases.map((arg) => ({ user_id: arg }));
}
const toQuery = (phrase: string): any => ({
  query: {
    bool: {
      must: [
        {
          multi_match: {
            query: phrase,
            type: "phrase_prefix",
            fields: ["user_id"],
          },
        },
      ],
    },
  },
});

const getHits = (response) => response.body.hits.hits;

describe("User index", () => {
  const index = "user";
  const body = JSON.stringify({
    settings: {
      analysis: {
        normalizer: {
          uuid: {
            type: "custom",
            char_filter: ["no_dashes"],
            filter: ["lowercase"],
          },
        },
        char_filter: {
          no_dashes: {
            type: "mapping",
            mappings: ["- => "],
          },
        },
        analyzer: {
          my_analyzer: {
            tokenizer: "standard",
            char_filter: ["no_dashes"],
            filter: ["lowercase"],
          },
        },
      },
    },
    mappings: {
      properties: {
        user_id: {
          type: "text",
          analyzer: "my_analyzer",
          fields: {
            uuid: {
              type: "keyword",
              normalizer: "uuid",
            },
          },
        },
      },
    },
  });
  const users = [
    { user_id: "aaa-bbb-ccc" },
    { user_id: "aaa-ccc-bbb" },
    { user_id: "ccc-aaa-bbb" },
  ];

  before(() => {
    api.index.create({ index, body });

    users.forEach((user) => {
      api.document.insert({ index, document: user });
    });

    cy.wait(1000);
  });

  const testCases = [
    {
      phrase: "aa-a-bbb-c-cc",
      expected: ["aaa-bbb-ccc"],
    },
    {
      phrase: "Aaabbbccc",
      expected: ["aaa-bbb-ccc"],
    },
    {
      phrase: "a",
      expected: ["aaa-bbb-ccc", "aaa-ccc-bbb"],
    },
    {
      phrase: "aaa",
      expected: ["aaa-bbb-ccc", "aaa-ccc-bbb"],
    },
    {
      phrase: "aaa-b",
      expected: ["aaa-bbb-ccc"],
    },
    { phrase: "aaa-bbb-ccc", expected: ["aaa-bbb-ccc"] },
    { phrase: "aaa-bbb-ccc", expected: ["aaa-bbb-ccc"] },
    // falsy
    { phrase: "aa-bbb-ccc", expected: [] },
    { phrase: "abc", expected: [] },
    { phrase: "aaabbbcccd", expected: [] },
    { phrase: "qwe", expected: [] },
  ];

  describe(`Given: ${JSON.stringify(users)}`, () => {
    testCases.forEach(({ phrase, expected }) => {
      it(`for "${phrase}"  =>  ${JSON.stringify(expected)}`, () => {
        api.document
          .search({ index, query: toQuery(phrase) })
          .then((response) => {
            const hits = getHits(response).map((hit) => hit._source);

            return JSON.stringify(hits);
          })
          .should(($res) => {
            expect($res).to.eql(JSON.stringify(toExpected(expected)));
          });
      });
    });
  });

  after(() => {
    api.index.delete({ index });
  });
});
