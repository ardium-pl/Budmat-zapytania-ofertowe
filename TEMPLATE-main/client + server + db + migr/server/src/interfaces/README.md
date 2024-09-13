This folder will store interfaces used in various places inside of this express app.

They will mostly be used to define request and response structure for all endpoints.

In most cases, each file should contain one interface and one type: a request interface and a response type. The response type must always be a union of interfaces that define what kind of responses might the client receive.
It must always contain a success response interface and some kind of error response interface(s). See `login.EXAMPLE.ts` to see this in action.