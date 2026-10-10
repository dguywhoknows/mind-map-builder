/* ---------------- demo data (no-key mode) ---------------- */
function demoTree(topic) {
  if (!/machine learning/i.test(topic)) {
    return { title: topic, children: ['Core ideas', 'History', 'Key people', 'How it works', 'Applications', 'Debates'].map((t) => ({ title: t, note: `${t} of ${topic} (demo placeholder).`, children: demoChildren(t).slice(0, 3) })) };
  }
  return {
    title: 'Machine learning',
    children: [
      { title: 'Supervised learning', note: 'Learning a mapping from labeled examples.', children: [{ title: 'Regression', note: 'Predicting continuous values.' }, { title: 'Classification', note: 'Predicting discrete labels.' }, { title: 'Decision trees', note: 'Recursive feature splits.' }, { title: 'Neural networks', note: 'Stacked differentiable layers.' }] },
      { title: 'Unsupervised learning', note: 'Finding structure without labels.', children: [{ title: 'Clustering', note: 'Grouping similar points, e.g. k-means.' }, { title: 'Dimensionality reduction', note: 'PCA, t-SNE, UMAP.' }, { title: 'Anomaly detection', note: 'Spotting rare outliers.' }] },
      { title: 'Reinforcement learning', note: 'Learning by trial, error and reward.', children: [{ title: 'Policies', note: 'Mapping states to actions.' }, { title: 'Q-learning', note: 'Estimating action values.' }, { title: 'Exploration', note: 'Trying new actions to learn.' }] },
      { title: 'Model evaluation', note: 'Measuring how well a model generalizes.', children: [{ title: 'Train/test split', note: 'Hold out unseen data.' }, { title: 'Overfitting', note: 'Memorizing noise instead of signal.' }, { title: 'Metrics', note: 'Accuracy, F1, RMSE, AUC.' }] },
      { title: 'Data pipeline', note: 'Getting data model-ready.', children: [{ title: 'Feature engineering', note: 'Crafting informative inputs.' }, { title: 'Cleaning', note: 'Fixing missing and wrong values.' }, { title: 'Labeling', note: 'Creating ground truth.' }] },
      { title: 'Ethics & risks', note: 'Making ML fair, safe and accountable.', children: [{ title: 'Bias', note: 'Skewed data leads to skewed models.' }, { title: 'Privacy', note: 'Protecting personal data.' }, { title: 'Explainability', note: 'Understanding model decisions.' }] },
    ],
  };
}
function demoChildren(title) {
  return ['Key examples', 'Common pitfalls', 'Real-world use', 'Open questions', 'Related ideas'].map((t) => ({ title: `${t}`, note: `${t} for ${title} (demo placeholder).` }));
}

