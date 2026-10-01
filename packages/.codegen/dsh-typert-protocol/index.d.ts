/**
 * Type-only marker declarations for the Typert workspace analyzer.
 * Runtime values always come from the installed 0.2.0-rc.2 peer dependency.
 */
export interface TypertGatewayBindingOptions {
  readonly namespace?: string
}

export declare abstract class TypertRemoteService {
  protected constructor(
    ctx: object,
    serviceKey: string,
    options?: TypertGatewayBindingOptions,
  )
}

export type RemoteMethodDecorator = <This extends object, Args extends unknown[], Result>(
  method: (this: This, ...args: Args) => Result,
  context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Result>,
) => void

export declare function Remote(name: string): RemoteMethodDecorator
