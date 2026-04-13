import React from "react";
import { StatusBar } from "expo-status-bar";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Text } from "react-native";

import ConvertScreen  from "./src/screens/ConvertScreen";
import LibraryScreen  from "./src/screens/LibraryScreen";
import SettingsScreen from "./src/screens/SettingsScreen";

const Tab = createBottomTabNavigator();

const C = {
  bg:      "#0f0f0f",
  surface: "#1a1a1a",
  border:  "#2a2a2a",
  accent:  "#e53935",
  text:    "#f0f0f0",
  muted:   "#666",
};

export default function App() {
  return (
    <NavigationContainer theme={{
      dark: true,
      colors: {
        primary: C.accent,
        background: C.bg,
        card: C.surface,
        text: C.text,
        border: C.border,
        notification: C.accent,
      },
    }}>
      <StatusBar style="light" />
      <Tab.Navigator
        screenOptions={{
          headerStyle:      { backgroundColor: C.surface },
          headerTintColor:  C.text,
          tabBarStyle:      { backgroundColor: C.surface, borderTopColor: C.border },
          tabBarActiveTintColor:   C.accent,
          tabBarInactiveTintColor: C.muted,
        }}
      >
        <Tab.Screen
          name="Convert"
          component={ConvertScreen}
          options={{
            title: "Convert",
            tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>⬇</Text>,
            headerTitle: "YouTube → MP3",
          }}
        />
        <Tab.Screen
          name="Library"
          component={LibraryScreen}
          options={{
            title: "Library",
            tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>♪</Text>,
          }}
        />
        <Tab.Screen
          name="Settings"
          component={SettingsScreen}
          options={{
            title: "Settings",
            tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>⚙</Text>,
          }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
