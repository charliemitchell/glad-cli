module.exports = {

  GET : [{
    path : '/{{plural_lower_name}}',
    action : 'Get'
  },
  {
    path : '/{{plural_lower_name}}/:id',
    action : 'FindOne'
  }],

  POST : [{
    path : '/{{plural_lower_name}}',
    action : 'Post'
  }],

  PUT : [{
    path : '/{{plural_lower_name}}/:id',
    action : 'Put'
  }],

  DELETE : [{
    path : '/{{plural_lower_name}}',
    action : 'destroy'
  }]

};
