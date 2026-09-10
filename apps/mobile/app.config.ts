import type { ExpoConfig } from 'expo/config';
const config: ExpoConfig = {
  name:'RoadStar',slug:'roadstar-carrier',version:'0.1.0',orientation:'portrait',userInterfaceStyle:'light',
  extra:{eas:{projectId:process.env.EXPO_PUBLIC_EAS_PROJECT_ID}},
  ios:{bundleIdentifier:'com.roadstar.carrier',supportsTablet:true},
  android:{package:'com.roadstar.carrier',config:{googleMaps:{apiKey:process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY ?? ''}}},
  plugins:['expo-sqlite','expo-notifications','expo-secure-store',['expo-image-picker',{photosPermission:'Choose a trip document to share with your carrier.',cameraPermission:'Capture proof of delivery for your current trip.',microphonePermission:false}],['expo-location',{locationWhenInUsePermission:'RoadStar shares location during a work session when you explicitly enable sharing.',locationAlwaysAndWhenInUsePermission:'Allow RoadStar to share location in the background for an explicitly active work session. Stop sharing or sign out at any time.',isIosBackgroundLocationEnabled:true,isAndroidBackgroundLocationEnabled:true,isAndroidForegroundServiceEnabled:true}]],
};
export default config;
