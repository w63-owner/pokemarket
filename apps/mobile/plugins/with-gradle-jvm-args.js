const { withGradleProperties } = require('@expo/config-plugins');

/**
 * Increases the Gradle daemon JVM heap to 4 GB so R8 minification
 * doesn't OOM during local production builds.
 */
module.exports = function withGradleJvmArgs(config) {
  return withGradleProperties(config, (config) => {
    config.modResults = config.modResults.filter(
      (item) => !(item.type === 'property' && item.key === 'org.gradle.jvmargs'),
    );
    config.modResults.push({
      type: 'property',
      key: 'org.gradle.jvmargs',
      value: '-Xmx8192m -XX:MaxMetaspaceSize=1024m',
    });

    config.modResults = config.modResults.filter(
      (item) => !(item.type === 'property' && item.key === 'org.gradle.workers.max'),
    );
    config.modResults.push({
      type: 'property',
      key: 'org.gradle.workers.max',
      value: '4',
    });
    return config;
  });
};
