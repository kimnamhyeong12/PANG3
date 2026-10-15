import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../constants/design';

export default class AppErrorBoundary extends React.Component {
  state = { failed: false, attempt: 0 };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error, info) { console.error('앱 화면 오류:', error, info.componentStack); }
  render() {
    if (this.state.failed) return <View style={styles.container}>
      <Text style={styles.title}>화면을 열지 못했습니다.</Text>
      <Text style={styles.description}>다시 열기를 눌러 앱을 불러와 주세요.</Text>
      <TouchableOpacity style={styles.button} onPress={() => this.setState(({ attempt }) => ({ failed: false, attempt: attempt + 1 }))}><Text style={styles.buttonText}>다시 열기</Text></TouchableOpacity>
    </View>;
    return <React.Fragment key={this.state.attempt}>{this.props.children}</React.Fragment>;
  }
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 28, alignItems: 'center', justifyContent: 'center', gap: 18 },
  title: { color: colors.text, fontSize: 18, fontWeight: '700' }, description: { color: colors.textSoft, textAlign: 'center' },
  button: { backgroundColor: colors.primary, paddingHorizontal: 24, paddingVertical: 13, borderRadius: 12 }, buttonText: { color: '#FFFFFF', fontWeight: '700' },
});
