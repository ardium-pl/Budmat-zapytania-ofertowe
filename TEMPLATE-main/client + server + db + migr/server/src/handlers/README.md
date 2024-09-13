This folder will store implementations of every endpoint in the app.

For every endpoint, a separate file should be created <sub>(unless it is absolutely required to store multiple implementations in a single file)</sub>

## Rules of defining new handlers
All handlers must have their request and response types specified, and the response MUST follow these rules:

### 1. The success response
The success response must be this kind of JSON object:
```ts
{
  success: true;
  // additional fields here...
}
```

### 2. Generic error responses
If the handler needs to return an error response that lets the user know that something is not right, it should follow this pattern:
```ts
{
  success: false;
  error: string;
  // additional fields here...
}
```

#### Tip: use error codes
The `error` field in the response should not be a long message. It would be best to use a __descriptive__ error code. Here are some examples:
```
WRONG_EMAIL_OR_PASSWORD      when the user tries to log in to their account, but the credentials don't match
EMAIL_EXISTS                 when the user tries to create a new account, but an account with that email already exists
ALREADY_LOGGED_OUT           when the user tries to log out, but they are already logged out
```

### 3. Checking if the request is correct
You can never guarantee that the request that comes from the client has the request body defined correctly. You may expect it to contain for example the field `email`, but it isn't there. Or maybe the `email` field contains a number instead of a string.

Because of this you always have to verify every field of the body before using it. In this app, we will be using the `Assert` class found in the `src/utils/assert` folder. It checks everything you need, and also automatically sends the correct response to the client if something is not right! Here is an example on how to use it:
```ts
// you want to check if the "username" field is defined, it is a string, and it meets certain length criteria
if (new Assert(res, req.body, 'username').exists().isString().minLength(6).maxLength(256).isFailed) return;

// you want to check if the "age" field is defined, it is a number, and it meets certain number criteria
if (new Assert(res, req.body, 'age').exists().isNumber().isMoreThan(18).isFailed) return;
```

#### Important info
1. the `Assert` class should always be instanciated in the same way: you should pass in the response object, the request body object, and the name of the field to be checked.
2. At the end of the chain of checks, there should ALWAYS be an `.isFailed`. It lets the handler know that something about the field is messed up, and the function should not continue.
3. The `Assert` class should always be created inside of an if statement, after which there should be a `return` statement. Do not do it any other way.
4. Always start with using the `Assert` class, do not start with any other classes defined in that folder. The server might crash!