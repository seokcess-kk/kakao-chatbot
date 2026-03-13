function buildSimpleTextResponse(text) {
  return {
    version: '2.0',
    template: {
      outputs: [
        {
          simpleText: {
            text,
          },
        },
      ],
    },
  };
}

module.exports = {
  buildSimpleTextResponse,
};
