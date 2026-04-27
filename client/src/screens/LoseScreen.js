import React from 'react';
import AARScreen from '../components/design/AAR';

export default function LoseScreen({ navigate, screenData }) {
  return <AARScreen navigate={navigate} screenData={screenData} isWin={false} />;
}
