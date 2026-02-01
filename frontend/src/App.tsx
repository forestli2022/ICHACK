import React from 'react';
import TextFollower from './TextFollower';

const SENTENCE =
  'Once upon a time, there was a sweet little girl loved by everyone who met her - but most of all by her grandmother. The old woman adored her so much that she made her a small red velvet hood.';

const App: React.FC = () => {
  return <TextFollower text={SENTENCE} />;
};

export default App;
