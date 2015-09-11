/// <reference path="../polymer-ts/polymer-ts.ts" />

@component("hello-world")
class HelloWorld extends polymer.Base
{
  @property({ type: String, value: 'Polymer' })
  target: string;
  
  attached() {
    this.$['target'].innerText = this.target;
  }
}

HelloWorld.register();
