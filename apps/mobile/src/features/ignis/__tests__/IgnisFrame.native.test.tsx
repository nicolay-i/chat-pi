import React from 'react';
import { View } from 'react-native';
import { render } from '@testing-library/react-native';
import { IgnisFrame } from '../IgnisFrame.native';

function mockWebView(props: object) {
  return React.createElement(View, props);
}

jest.mock('react-native-webview', () => ({ WebView: mockWebView }));

describe('IgnisFrame on native platforms', () => {
  it('renders the configured vault URL inside the app WebView', async () => {
    const screen = await render(<IgnisFrame url="https://ignis.tailnet.example" />);

    expect(screen.getByTestId('ignis.webview').props.source).toEqual({ uri: 'https://ignis.tailnet.example' });
    expect(screen.getByTestId('ignis.webview').props.setSupportMultipleWindows).toBe(false);
  });
});
