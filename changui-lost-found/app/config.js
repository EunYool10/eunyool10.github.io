// Firebase 웹 연결값. 비밀 값이 아니며, 데이터 보호는 firestore.rules가 맡습니다.
export const firebaseConfig = {
  "apiKey": "AIzaSyA5n0evdKtrNvk7O9QEBBYwExDJVze-_go",
  "authDomain": "changui-lostfound.firebaseapp.com",
  "projectId": "changui-lostfound",
  "appId": "1:621066407121:web:ae97a83b4dd2d0a7cec9f0",
  "messagingSenderId": "621066407121"
};

// 카카오 로그인: 카카오 디벨로퍼스 › 앱 키 › REST API 키 (공개 값). 비어 있으면 카카오 버튼은 준비 중으로 보입니다.
export const kakaoRestKey = '26db5b0e9ebf525c84c1143905d0105c';
// 카카오 로그인 서버 (server/, Render)
export const authServer = 'https://changui-lostfound-auth.onrender.com';
