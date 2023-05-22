##  Signup user

Get link from aws console (User Pool > Pool Name > App clients and analytics)

https://xxx.auth.us-east-1.amazoncognito.com/login?client_id=yyy&response_type=code&scope=zzz&redirect_uri=https%3A%2F%2Fexample.com

Changes:

 /login? -> /signup?

 response_type=code ->  response_type=token

 Remove scope in query string


## Login

For login, use hosted ui from AWS.

Get link from aws console (User Pool > Pool Name > App clients and analytics)

https://xxx.auth.us-east-1.amazoncognito.com/login?client_id=yyy&response_type=code&scope=zzz&redirect_uri=https%3A%2F%2Fexample.com

Change: response_type=code to response_type=token and will get de token from query string after login
