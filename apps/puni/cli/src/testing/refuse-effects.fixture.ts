Date.now = () => {
  throw new Error('discovery read the ambient clock');
};
globalThis.fetch = Object.assign(
  () => {
    throw new Error('discovery attempted a network operation');
  },
  {
    preconnect: () => {
      throw new Error('discovery attempted a network preconnection');
    },
  },
);

Bun.plugin({
  name: 'refuse-provider-runtime-in-discovery',
  setup(build) {
    build.onLoad(
      {
        filter:
          /twilight-(?:navigator|burokrat|dash)\/cli\/src\/(?:cli|bin|entrypoint|clock|runtime-facade)\.ts$/u,
      },
      () => {
        throw new Error('discovery loaded a provider runtime');
      },
    );
  },
});
