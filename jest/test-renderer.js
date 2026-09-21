const ReactTestRenderer = require('react-test-renderer');

module.exports = {
  ...ReactTestRenderer,
  createRoot: (options) => {
    let testRendererInstance = null;
    return {
      render: (element) => {
        if (!testRendererInstance) {
          testRendererInstance = ReactTestRenderer.create(element, options);
        } else {
          testRendererInstance.update(element);
        }
      },
      unmount: () => {
        if (testRendererInstance) {
          testRendererInstance.unmount();
        }
      },
      get container() {
        return testRendererInstance ? testRendererInstance.root : null;
      },
      toJSON: () => (testRendererInstance ? testRendererInstance.toJSON() : null),
    };
  },
};
